---
title: Execute Swaps on EulerSwap
impact: MEDIUM
impactDescription: Token swaps via Euler liquidity
tags: swap, execute, amm, trade
---

## Execute Swaps on EulerSwap

EulerSwap pools provide a Uniswap V2-compatible interface for executing swaps. Liquidity comes from Euler lending vaults, enabling deeper markets than traditional AMMs.

**Incorrect (swap without checking limits):**

```solidity
// Large swaps may exceed pool liquidity limits
pool.swap(hugeAmount, 0, recipient, "");
// Reverts if amount exceeds getLimits()
```

**Correct (basic swap execution):**

```solidity
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

// Step 1: Get quote and check limits
// computeQuote(tokenIn, tokenOut, amount, exactIn)
uint256 amountOut = IEulerSwap(pool).computeQuote(tokenIn, tokenOut, amountIn, true);
uint256 minOut = amountOut * 995 / 1000; // 0.5% slippage

// Step 2: Transfer input tokens to pool
IERC20(tokenIn).transfer(pool, amountIn);

// Step 3: Execute swap (Uniswap V2 style)
// amount0Out and amount1Out - one is your output, other is 0
(address asset0,) = IEulerSwap(pool).getAssets();
bool tokenInIsToken0 = tokenIn == asset0;

IEulerSwap(pool).swap(
    tokenInIsToken0 ? 0 : minOut,       // amount0Out
    tokenInIsToken0 ? minOut : 0,        // amount1Out
    recipient,                            // to
    ""                                    // data (empty for simple swap)
);
```

**Correct (using EulerSwapPeriphery for safety):**

```solidity
import {IEulerSwapPeriphery} from "euler-swap/interfaces/IEulerSwapPeriphery.sol";

// Periphery handles token transfers and slippage checks

// Exact input swap
IERC20(tokenIn).approve(periphery, amountIn);

uint256 amountOut = IEulerSwapPeriphery(periphery).swapExactIn(
    pool,
    amountIn,
    minAmountOut,     // Slippage protection
    tokenIn,
    recipient,
    deadline          // Transaction deadline
);

// Exact output swap
IERC20(tokenIn).approve(periphery, maxAmountIn);

uint256 amountIn = IEulerSwapPeriphery(periphery).swapExactOut(
    pool,
    amountOut,        // Exact amount to receive
    maxAmountIn,      // Max willing to pay
    tokenIn,
    recipient,
    deadline
);
```

**Correct (TypeScript swap execution):**

```typescript
import { encodeFunctionData } from 'viem';

async function executeSwap(
  pool: Address,
  tokenIn: Address,
  amountIn: bigint,
  minAmountOut: bigint,
  recipient: Address
) {
  // Use getAssets() to get token addresses
  const [asset0, asset1] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getAssets',
  });
  
  const tokenInIsToken0 = tokenIn.toLowerCase() === asset0.toLowerCase();
  
  // Approve and transfer in one tx via EVC batch
  const batchItems = [
    // Transfer tokens to pool
    {
      onBehalfOfAccount: sender,
      targetContract: tokenIn,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20ABI,
        functionName: 'transfer',
        args: [pool, amountIn],
      }),
    },
    // Execute swap
    {
      onBehalfOfAccount: sender,
      targetContract: pool,
      value: 0n,
      data: encodeFunctionData({
        abi: eulerSwapABI,
        functionName: 'swap',
        args: [
          tokenInIsToken0 ? 0n : minAmountOut,
          tokenInIsToken0 ? minAmountOut : 0n,
          recipient,
          '0x',
        ],
      }),
    },
  ];
  
  return await evc.write.batch([batchItems]);
}
```

**Correct (flash swap with callback):**

```solidity
// Flash swaps: receive tokens first, pay in callback
contract FlashSwapper {
    function executeFlashSwap(
        address pool,
        uint256 amount0Out,
        uint256 amount1Out,
        bytes calldata data
    ) external {
        // Request tokens without paying upfront
        IEulerSwap(pool).swap(amount0Out, amount1Out, address(this), data);
    }
    
    // Callback from pool
    function eulerSwapCall(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external {
        // We've received the output tokens
        // Now we must pay the input tokens
        
        address pool = msg.sender;
        (address token0, address token1) = IEulerSwap(pool).getAssets();
        
        // Calculate required input (with fee)
        // computeQuote(tokenIn, tokenOut, amount, exactIn)
        address tokenIn = amount0 > 0 ? token1 : token0;
        address tokenOut = amount0 > 0 ? token0 : token1;
        uint256 amountIn = IEulerSwap(pool).computeQuote(
            tokenIn,
            tokenOut,
            amount0 > 0 ? amount0 : amount1,
            false // exact output
        );
        
        // Do something with received tokens (arbitrage, etc.)
        // ...
        
        // Pay back input tokens
        IERC20(tokenIn).transfer(pool, amountIn);
    }
}
```

**Correct (multi-hop swap via aggregator):**

```typescript
// For routes through multiple pools
async function multiHopSwap(
  route: Address[], // [tokenA, pool1, tokenB, pool2, tokenC]
  amountIn: bigint,
  minFinalOut: bigint
) {
  let currentAmount = amountIn;
  
  for (let i = 0; i < route.length - 1; i += 2) {
    const tokenIn = route[i];
    const pool = route[i + 1];
    const tokenOut = route[i + 2];
    
    // Quote this hop
    const [hopOut] = await IEulerSwap(pool).computeQuote(currentAmount, true);
    
    // Execute hop
    await executeSwap(pool, tokenIn, currentAmount, hopOut * 99n / 100n, sender);
    
    currentAmount = hopOut;
  }
  
  require(currentAmount >= minFinalOut, 'Insufficient output');
}
```

Key points:
- Transfer input tokens to pool before calling swap
- Use periphery for simpler interface with built-in safety
- Flash swaps available via callback mechanism
- Check limits with `getLimits()` for large swaps
- Always use slippage protection and deadlines

Reference: [EulerSwap README](https://github.com/euler-xyz/euler-swap#for-solvers)
