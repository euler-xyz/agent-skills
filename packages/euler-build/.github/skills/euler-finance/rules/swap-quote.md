---
title: Get Swap Quotes from EulerSwap
impact: MEDIUM
impactDescription: Price discovery for swap execution
tags: swap, quote, amm, price, liquidity
---

## Get Swap Quotes from EulerSwap

EulerSwap provides deep liquidity by borrowing output tokens against input tokens via Euler credit vaults. Use `computeQuote` to get exact prices before executing swaps.

**Incorrect (using old quote for execution):**

```solidity
// Quotes can change between blocks!
uint256 quote = pool.computeQuote(amountIn, true);
// ... time passes, other transactions happen ...
pool.swap(amountIn, quote, recipient, "");
// May revert if price moved - quote is stale
```

**Correct (query and execute atomically):**

```solidity
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

// Get quote for exact input swap
// computeQuote(tokenIn, tokenOut, amount, exactIn) returns amountOut
uint256 amountOut = IEulerSwap(pool).computeQuote(
    tokenIn,           // Input token address
    tokenOut,          // Output token address
    amountIn,          // Amount of input token
    true               // Exact input (vs exact output)
);

// Apply slippage tolerance
uint256 minAmountOut = amountOut * 995 / 1000; // 0.5% slippage

// Transfer tokens to pool first (Uniswap V2 style)
IERC20(tokenIn).transfer(pool, amountIn);

// Execute swap - specify amounts OUT (Uniswap V2 interface)
// swap(amount0Out, amount1Out, to, data)
bool tokenOutIsToken0 = tokenOut == IEulerSwap(pool).token0();
IEulerSwap(pool).swap(
    tokenOutIsToken0 ? minAmountOut : 0,
    tokenOutIsToken0 ? 0 : minAmountOut,
    recipient,
    ""
);
```

**Correct (exact output quote):**

```solidity
// For exact output: "I want exactly X tokens out"

// Get quote: how much input needed for desired output?
// computeQuote(tokenIn, tokenOut, amount, exactIn)
uint256 amountIn = IEulerSwap(pool).computeQuote(
    tokenIn,            // Input token address
    tokenOut,           // Output token address
    desiredAmountOut,   // Exact amount you want to receive
    false               // Exact output mode (false = exact output)
);

// Apply slippage tolerance (allow paying slightly more)
uint256 maxAmountIn = amountIn * 1005 / 1000; // 0.5% slippage

// Transfer input tokens first
IERC20(tokenIn).transfer(pool, maxAmountIn);

// Execute swap (Uniswap V2 style interface)
pool.swap(
    tokenOutIsToken0 ? desiredAmountOut : 0,
    tokenOutIsToken0 ? 0 : desiredAmountOut,
    recipient,
    ""
);
```

**Correct (using EulerSwapPeriphery):**

```typescript
import { EulerSwapPeriphery } from '@eulerxyz/euler-swap';

// Periphery provides simpler interface with built-in protections

// Quote exact input
const quoteExactIn = await periphery.quoteExactInput(
  pool,
  amountIn,
  tokenIn === token0
);

console.log(`${amountIn} tokenIn -> ${quoteExactIn} tokenOut`);

// Quote exact output  
const quoteExactOut = await periphery.quoteExactOutput(
  pool,
  amountOut,
  tokenIn === token0
);

console.log(`${quoteExactOut} tokenIn needed for ${amountOut} tokenOut`);
```

**Correct (checking quote validity):**

```solidity
// computeQuote reverts if:
// 1. Insufficient liquidity
// 2. Pool is decommissioned
// 3. Amount exceeds pool limits

function safeQuote(
    address pool,
    address tokenIn,
    address tokenOut,
    uint256 amount,
    bool exactIn
) public view returns (uint256 quote, bool valid) {
    try IEulerSwap(pool).computeQuote(tokenIn, tokenOut, amount, exactIn) 
        returns (uint256 result) 
    {
        return (result, true);
    } catch {
        return (0, false);
    }
}

// Check limits before quoting
(uint256 limit0In, uint256 limit1In, uint256 limit0Out, uint256 limit1Out) = 
    IEulerSwap(pool).getLimits();

// Ensure your swap is within limits
require(amountIn <= (tokenInIsToken0 ? limit0In : limit1In), "Exceeds input limit");
```

**Correct (comparing across pools):**

```typescript
interface SwapRoute {
  pool: Address;
  amountOut: bigint;
  priceImpact: number;
}

async function findBestRoute(
  pools: Address[],
  amountIn: bigint,
  tokenIn: Address
): Promise<SwapRoute | null> {
  const quotes = await Promise.all(
    pools.map(async (pool) => {
      try {
        const token0 = await IEulerSwap(pool).token0();
        const tokenInIsToken0 = tokenIn === token0;
        
        const [amountOut] = await IEulerSwap(pool).computeQuote(
          amountIn,
          true // exact input
        );
        
        // Calculate price impact
        const spotPrice = await getSpotPrice(pool);
        const executionPrice = amountOut * 1e18 / amountIn;
        const priceImpact = (spotPrice - executionPrice) / spotPrice;
        
        return { pool, amountOut, priceImpact };
      } catch {
        return null;
      }
    })
  );
  
  // Filter failed quotes and sort by best output
  return quotes
    .filter((q): q is SwapRoute => q !== null)
    .sort((a, b) => Number(b.amountOut - a.amountOut))[0];
}
```

Key points:
- Always quote and execute atomically (same tx)
- Use slippage tolerance to handle price movement
- Check `getLimits()` before large swaps
- Quote reverts if insufficient liquidity
- Compare quotes across multiple pools for best price

Reference: [EulerSwap Interface](https://github.com/euler-xyz/euler-swap/blob/master/src/interfaces/IEulerSwap.sol)
