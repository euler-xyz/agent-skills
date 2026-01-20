---
title: Check EulerSwap Liquidity Limits
impact: MEDIUM
impactDescription: Understand available swap capacity
tags: swap, liquidity, limits, capacity
---

## Check EulerSwap Liquidity Limits

EulerSwap pools have directional liquidity limits based on the underlying Euler vault positions. Understanding these limits is crucial for executing large swaps successfully.

**Incorrect (assuming unlimited liquidity):**

```solidity
// EulerSwap pools have finite, directional limits
// Unlike AMMs, liquidity comes from lending positions
pool.swap(1_000_000e18, 0, recipient, "");
// May fail if exceeds pool's borrowing capacity
```

**Correct (check limits before swapping):**

```solidity
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

// getLimits(tokenIn, tokenOut) returns two values:
// - inLimit: max tokenIn that can be sold
// - outLimit: max tokenOut that can be bought
(uint256 inLimit, uint256 outLimit) = IEulerSwap(pool).getLimits(tokenIn, tokenOut);

// Check if your swap is within limits
require(amountIn <= inLimit, "Exceeds input limit");
// Output will be checked by computeQuote

// For the reverse direction, call with swapped tokens:
(uint256 reverseInLimit, uint256 reverseOutLimit) = IEulerSwap(pool).getLimits(tokenOut, tokenIn);
```

**Correct (understanding limit factors):**

```typescript
interface PoolLiquidity {
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  limits: {
    inLimit: bigint;   // max tokenIn that can be sold
    outLimit: bigint;  // max tokenOut that can be bought
  };
  factors: {
    vaultCash: bigint;
    borrowCap: bigint;
    supplyCap: bigint;
    utilization: number;
  };
}

async function analyzeLiquidity(pool: Address, tokenIn: Address, tokenOut: Address): Promise<PoolLiquidity> {
  // getLimits takes tokenIn and tokenOut addresses
  const [inLimit, outLimit] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getLimits',
    args: [tokenIn, tokenOut],
  });
  
  // Limits depend on:
  // 1. Available cash in lending vaults (for output)
  // 2. Remaining borrow capacity (for borrowing output)
  // 3. Supply caps (for depositing input as collateral)
  // 4. Current utilization of vaults
  
  const vault0 = await pool.vault0();
  const vault1 = await pool.vault1();
  
  // Get static params for vault info
  const staticParams = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getStaticParams',
  });
  
  const vault0Info = await vaultLens.getVaultInfoDynamic(staticParams.supplyVault0);
  
  return {
    pool,
    tokenIn,
    tokenOut,
    limits: {
      inLimit,   // max tokenIn that can be sold
      outLimit,  // max tokenOut that can be bought
    },
    factors: {
      vaultCash: vault0Info.totalCash,
      borrowCap: vault0Info.borrowCap,
      supplyCap: vault0Info.supplyCap,
      utilization: vault0Info.totalBorrowed / vault0Info.totalAssets,
    },
  };
}
```

**Correct (splitting large swaps):**

```solidity
// If swap exceeds limits, split into multiple smaller swaps
function splitSwap(
    address pool,
    uint256 totalAmountIn,
    address tokenIn,
    address tokenOut,
    uint256 minTotalOut
) external returns (uint256 totalOut) {
    (address asset0,) = IEulerSwap(pool).getAssets();
    bool sellingToken0 = tokenIn == asset0;
    
    uint256 remaining = totalAmountIn;
    
    while (remaining > 0) {
        // Check current limits - getLimits(tokenIn, tokenOut)
        (uint256 inLimit,) = IEulerSwap(pool).getLimits(tokenIn, tokenOut);
        
        if (inLimit == 0) {
            // Pool at capacity - wait or use different pool
            break;
        }
        
        uint256 swapAmount = remaining > inLimit ? inLimit : remaining;
        
        // Get quote and execute swap
        uint256 out = IEulerSwap(pool).computeQuote(tokenIn, tokenOut, swapAmount, true);
        IERC20(tokenIn).transfer(pool, swapAmount);
        IEulerSwap(pool).swap(
            sellingToken0 ? 0 : out,
            sellingToken0 ? out : 0,
            address(this),
            ""
        );
        
        totalOut += out;
        remaining -= swapAmount;
        
        // Note: In practice, limits may not refresh within same tx
        // This pattern works better across blocks
    }
    
    require(totalOut >= minTotalOut, "Insufficient output");
}
```

**Correct (monitoring pool health):**

```typescript
async function isPoolHealthy(
  pool: Address,
  token0: Address,
  token1: Address
): Promise<boolean> {
  // Check if pool can fulfill swaps in both directions
  // getLimits(tokenIn, tokenOut) returns (inLimit, outLimit)
  const [limit0To1In, limit0To1Out] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getLimits',
    args: [token0, token1],
  });
  
  const [limit1To0In, limit1To0Out] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getLimits',
    args: [token1, token0],
  });
  
  // Pool should have meaningful limits in both directions
  const MIN_MEANINGFUL_LIMIT = 1000n * 10n ** 18n; // $1000 worth
  
  const hasForwardLiquidity = limit0To1In > MIN_MEANINGFUL_LIMIT;
  const hasReverseLiquidity = limit1To0In > MIN_MEANINGFUL_LIMIT;
  
  // Check pool is registered and not abandoned
  const isRegistered = await registry.isRegistered(pool);
  
  return hasForwardLiquidity && hasReverseLiquidity && isRegistered;
}

// Find pools with best liquidity for your swap size
async function findLiquidPools(
  tokenIn: Address,
  tokenOut: Address,
  requiredAmount: bigint
): Promise<Address[]> {
  const allPools = await registry.getPools(tokenIn, tokenOut);
  
  const liquidPools = await Promise.all(
    allPools.map(async (pool) => {
      const [inLimit,] = await publicClient.readContract({
        address: pool,
        abi: eulerSwapABI,
        functionName: 'getLimits',
        args: [tokenIn, tokenOut],
      });
      return inLimit >= requiredAmount ? pool : null;
    })
  );
  
  return liquidPools.filter((p): p is Address => p !== null);
}
```

Key concepts:
- getLimits(tokenIn, tokenOut) returns (inLimit, outLimit) for that specific direction
- Call getLimits twice with swapped arguments to check both directions
- Large swaps may need splitting across pools or time
- Pool registry tracks active, maintained pools
- Abandoned pools may have zero limits despite appearing active

Reference: [EulerSwap - Liquidity](https://github.com/euler-xyz/euler-swap#liquidity)
