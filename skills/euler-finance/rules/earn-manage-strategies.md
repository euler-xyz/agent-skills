---
title: Manage EulerEarn Strategies
impact: MEDIUM
impactDescription: Optimize yield through strategy allocation
tags: earn, strategies, allocation, reallocate, queue
---

## Manage EulerEarn Strategies

Strategy management involves adjusting allocations across ERC-4626 vaults to optimize yield while maintaining risk parameters. This is done by curators and allocators.

**Incorrect (reallocating without checking liquidity):**

```solidity
// This may fail if strategy doesn't have enough liquidity
earn.reallocate(
    [strategyA, strategyB],
    [type(uint256).max, 0]  // Withdraw all from A
);
// Error: strategy may have utilization, funds locked
```

**Correct (check liquidity before reallocating):**

```solidity
// Check available liquidity in each strategy
function getStrategyLiquidity(address strategy) 
    public view returns (uint256) 
{
    // For EVK vaults, check cash available
    try IEVault(strategy).cash() returns (uint256 cash) {
        return cash;
    } catch {
        // For generic ERC-4626, estimate via maxWithdraw
        return IERC4626(strategy).maxWithdraw(address(earn));
    }
}

// Reallocate respecting liquidity
uint256 availableLiquidity = getStrategyLiquidity(fromStrategy);
uint256 toWithdraw = min(desiredAmount, availableLiquidity);

// reallocate takes MarketAllocation[] struct array
// struct MarketAllocation { IERC4626 id; uint256 assets; }
// 
// CRITICAL: The assets field specifies the TARGET allocation, not the delta!
// - assets = 0: Withdraw everything from this strategy
// - assets = N: Leave exactly N assets in this strategy  
// - assets = type(uint256).max: Deposit all available cash into this strategy
//
// Order matters: withdrawals should come before deposits

MarketAllocation[] memory allocations = new MarketAllocation[](2);
allocations[0] = MarketAllocation({
    id: IERC4626(fromStrategy),
    assets: 0  // Target: leave 0 assets (withdraws everything)
});
allocations[1] = MarketAllocation({
    id: IERC4626(toStrategy),
    assets: type(uint256).max  // Target: deposit all available cash
});

earn.reallocate(allocations);
```

**Correct (updating supply queue priority):**

```typescript
// Supply queue determines deposit order
// First strategy gets filled first, then second, etc.

// Current queue: [vaultA, vaultB, vaultC]
// Want to prioritize vaultB for higher yield

const newSupplyQueue = [vaultB, vaultA, vaultC];

await earn.write.setSupplyQueue([newSupplyQueue]);

// Now deposits flow: vaultB (until cap) -> vaultA -> vaultC
```

**Correct (updating withdraw queue for liquidity):**

```solidity
// Withdraw queue determines withdrawal order
// Put most liquid strategies first for user experience

// Get current allocations
uint256[] memory allocations = new uint256[](strategies.length);
for (uint256 i = 0; i < strategies.length; i++) {
    allocations[i] = IERC4626(strategies[i]).balanceOf(address(earn));
}

// updateWithdrawQueue takes uint256[] indexes, NOT addresses
// The indexes represent the new order of the current withdraw queue
// Example: To swap positions 0 and 1 in a 3-element queue: [1, 0, 2]
uint256[] memory newOrder = sortByLiquidityIndexes(strategies);
earn.updateWithdrawQueue(newOrder);
```

**Correct (reducing strategy cap safely):**

```solidity
// To reduce exposure to a strategy:

// Step 1: Reduce cap (instant for curator/owner)
earn.submitCap(riskyStrategy, newLowerCap);
// No timelock for cap reduction!

// Step 2: If over cap, reallocate excess
uint256 currentAllocation = earn.expectedSupplyAssets(IERC4626(riskyStrategy));
if (currentAllocation > newLowerCap) {
    // reallocate takes MarketAllocation[] struct array
    // Set target allocation for risky strategy to the new cap
    MarketAllocation[] memory allocations = new MarketAllocation[](2);
    allocations[0] = MarketAllocation({
        id: IERC4626(riskyStrategy),
        assets: newLowerCap  // Target: reduce to new cap
    });
    allocations[1] = MarketAllocation({
        id: IERC4626(safeStrategy),
        assets: type(uint256).max  // Target: deposit all freed assets
    });
    
    earn.reallocate(allocations);
}
```

**Correct (emergency strategy removal):**

```solidity
// If a strategy is reverting/compromised:

// Step 1: Set cap to 0
earn.submitCap(brokenStrategy, 0);

// Step 2: Submit forced removal (starts timelock)
// Note: Takes IERC4626, not address
earn.submitMarketRemoval(IERC4626(brokenStrategy));

// Step 3: Wait for timelock

// Step 4: After timelock, update withdraw queue with new indexes
// updateWithdrawQueue takes uint256[] indexes to reorder/remove
// To remove an entry, omit its index from the array
// WARNING: Funds in removed strategy are considered lost!
uint256[] memory newIndexes = getQueueWithoutBrokenStrategy();
earn.updateWithdrawQueue(newIndexes);
```

**Correct (monitoring and rebalancing):**

```typescript
interface StrategyMetrics {
  address: Address;
  allocation: bigint;
  apy: number;
  utilization: number;
  liquidity: bigint;
}

async function getStrategyMetrics(
  earn: Address,
  strategy: Address
): Promise<StrategyMetrics> {
  const allocation = await IERC4626(strategy).balanceOf(earn);
  const vaultInfo = await vaultLens.getVaultInfoDynamic(strategy);
  
  return {
    address: strategy,
    allocation,
    apy: vaultInfo.irmInfo.interestRateInfo[0].supplyAPY / 1e25,
    utilization: vaultInfo.totalBorrowed / vaultInfo.totalAssets,
    liquidity: vaultInfo.totalCash,
  };
}

async function optimizeAllocation(earn: Address) {
  const strategies = await earn.withdrawQueue();
  const metrics = await Promise.all(
    strategies.map(s => getStrategyMetrics(earn, s))
  );
  
  // Sort by APY descending
  const byApy = [...metrics].sort((a, b) => b.apy - a.apy);
  
  // Reallocate to higher-yield strategies (respecting caps and liquidity)
  for (const highYield of byApy.slice(0, 3)) {
    const cap = await earn.caps(highYield.address);
    const headroom = cap - highYield.allocation;
    
    if (headroom > MIN_REALLOCATION) {
      // Find lower-yield strategy to pull from
      const lowYield = byApy[byApy.length - 1];
      const moveAmount = min(headroom, lowYield.liquidity);
      
      if (moveAmount > MIN_REALLOCATION) {
        // Reallocate: reduce low yield, increase high yield
        const allocations = [
          { id: lowYield.address, assets: lowYield.allocation - moveAmount },
          { id: highYield.address, assets: type(uint256).max },
        ];
        await earn.write.reallocate([allocations]);
      }
    }
  }
}
```

Key considerations:
- Only allocators/curators/owner can reallocate
- Respect strategy liquidity when withdrawing
- Cap increases are timelocked; decreases are instant
- Monitor strategy APYs and adjust allocations
- Keep some allocation in liquid/idle vault for withdrawals

See also: [Lens Contracts](tools-lens) - EulerEarnVaultLens provides `getVaultInfoFull()` to query all strategies and their allocations.

Reference: [EulerEarn Roles](https://github.com/euler-xyz/euler-earn#roles)
