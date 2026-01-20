---
title: How Liquidation Works on Euler
impact: HIGH
impactDescription: Understanding liquidation mechanics and protection
tags: risk, liquidation, health, discount, seize
---

## How Liquidation Works on Euler

Liquidation protects the protocol by allowing anyone to repay an unhealthy account's debt in exchange for their collateral at a discount. Understanding this mechanism is crucial for both avoiding liquidation and participating as a liquidator.

**Incorrect (assuming liquidation is always profitable):**

```solidity
// Liquidation is not always profitable!
// Must check discount, gas costs, and oracle prices
IEVault(vault).liquidate(violator, collateral, maxRepay, 0);
// May revert or result in loss if not checked properly
```

**Correct (checking if account is liquidatable):**

```solidity
// Check liquidation eligibility
function checkLiquidation(
    address vault,
    address violator,
    address collateral
) public view returns (
    bool isLiquidatable,
    uint256 maxRepay,
    uint256 maxYield
) {
    // Check health - must be below 1.0
    address[] memory collaterals = IEVC(evc).getCollaterals(violator);
    
    try IEVault(vault).checkAccountStatus(violator, collaterals) {
        // Account is healthy - cannot liquidate
        return (false, 0, 0);
    } catch {
        // Account is unhealthy - check liquidation details
    }
    
    // Get liquidation parameters
    // checkLiquidation(liquidator, violator, collateral) - 3 params
    (maxRepay, maxYield) = IEVault(vault).checkLiquidation(
        msg.sender,  // liquidator address
        violator,
        collateral
    );
    
    isLiquidatable = maxRepay > 0;
}
```

**Correct (executing a liquidation):**

```solidity
// Step 1: Verify liquidation is profitable
// checkLiquidation(liquidator, violator, collateral) returns (maxRepay, maxYield)
(uint256 maxRepay, uint256 maxYield) = IEVault(vault).checkLiquidation(
    address(this),  // liquidator
    violator,
    collateral
);

// Calculate if profitable after gas
uint256 repayValue = maxRepay * debtPrice / 1e18;
uint256 yieldValue = maxYield * collateralPrice / 1e18;
uint256 profit = yieldValue - repayValue;
require(profit > estimatedGasCost, "Not profitable");

// Step 2: Approve debt tokens
IERC20(debtAsset).approve(vault, maxRepay);

// Step 3: Execute liquidation via EVC's controlCollateral
// This allows the vault to seize collateral on behalf of liquidator
IEVC.BatchItem[] memory items = new IEVC.BatchItem[](1);
items[0] = IEVC.BatchItem({
    onBehalfOfAccount: address(this),
    targetContract: vault,
    value: 0,
    data: abi.encodeCall(
        IEVault.liquidate,
        (violator, collateral, maxRepay, 0)
    )
});

IEVC(evc).batch(items);
```

**Correct (liquidation with flash loan):**

```typescript
// Use flash loan to liquidate without capital
const batchItems = [
  // 1. Flash borrow the debt asset
  {
    onBehalfOfAccount: liquidator,
    targetContract: flashLoanVault,
    value: 0n,
    data: encodeFunctionData({
      abi: eVaultABI,
      functionName: 'borrow',
      args: [repayAmount, liquidator],
    }),
  },
  // 2. Execute liquidation
  {
    onBehalfOfAccount: liquidator,
    targetContract: debtVault,
    value: 0n,
    data: encodeFunctionData({
      abi: eVaultABI,
      functionName: 'liquidate',
      args: [violator, collateralVault, repayAmount, 0],
    }),
  },
  // 3. Swap seized collateral for debt asset
  {
    onBehalfOfAccount: liquidator,
    targetContract: swapRouter,
    value: 0n,
    data: swapCalldata,
  },
  // 4. Repay flash loan
  {
    onBehalfOfAccount: liquidator,
    targetContract: flashLoanVault,
    value: 0n,
    data: encodeFunctionData({
      abi: eVaultABI,
      functionName: 'repay',
      args: [repayAmount, liquidator],
    }),
  },
];

await evc.batch(batchItems);
```

**Liquidation Parameters:**

```solidity
// Key vault parameters affecting liquidation
uint16 maxLiquidationDiscount = IEVault(vault).maxLiquidationDiscount();
// e.g., 0.15e4 = 15% max discount

uint16 liquidationCoolOffTime = IEVault(vault).liquidationCoolOffTime();
// Time after liquidation before account can be liquidated again

// Discount calculation
// Discount increases as health decreases below 1.0
// At health = 0.9, discount might be 5%
// At health = 0.5, discount could be max (15%)
```

Key concepts:
- Liquidation only possible when health < 1.0
- Liquidator repays debt, receives collateral + discount
- Cool-off period prevents repeated liquidations
- Bad debt socialization if liquidation doesn't cover all debt
- Use batch for atomic flash-loan liquidations

Reference: [EVK Liquidation Module](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Liquidation.sol)
