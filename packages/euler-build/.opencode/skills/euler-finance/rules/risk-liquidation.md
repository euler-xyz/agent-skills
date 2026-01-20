---
title: How Liquidation Works on Euler
impact: HIGH
impactDescription: Understanding liquidation mechanics, math, and protection
tags: risk, liquidation, health, discount, seize, debt-socialization
---

## How Liquidation Works on Euler

Liquidation protects the protocol by allowing anyone to repay an unhealthy account's debt in exchange for their collateral at a discount. The discount is dynamically calculated based on how unhealthy the position is.

**Liquidation Math (from Liquidation.sol):**

```solidity
// ═══════════════════════════════════════════════════════════
// DISCOUNT CALCULATION
// ═══════════════════════════════════════════════════════════

// Health score (discountFactor) = risk-adjusted collateral / liability
// discountFactor = 1.0 means healthy, < 1.0 means liquidatable
uint256 discountFactor = collateralAdjustedValue * 1e18 / liabilityValue;

// Discount = 1 - discountFactor (i.e., 1 - health score)
// Example: health = 0.85 → discount = 15%

// Cap discount at maxLiquidationDiscount (set by governor)
uint256 minDiscountFactor = 1e18 - (1e18 * maxLiquidationDiscount / 1e4);
if (discountFactor < minDiscountFactor) {
    discountFactor = minDiscountFactor;  // Cap the discount
}

// ═══════════════════════════════════════════════════════════
// MAX REPAY AND YIELD CALCULATION
// ═══════════════════════════════════════════════════════════

// Start with full liability as max repay
uint256 maxRepayValue = liabilityValue;

// Yield value = repay value / discountFactor (more yield at lower health)
uint256 maxYieldValue = maxRepayValue * 1e18 / discountFactor;

// Limit by available collateral
uint256 collateralValue = oracle.getQuote(collateralBalance, collateral, unitOfAccount);
if (collateralValue < maxYieldValue) {
    // Can only seize what's available
    maxRepayValue = collateralValue * discountFactor / 1e18;
    maxYieldValue = collateralValue;
}

// Convert values to asset amounts
repay = maxRepayValue * liability / liabilityValue;
yieldBalance = maxYieldValue * collateralBalance / collateralValue;
```

**Practical Example:**

```
Position:
- Debt: 1000 USDC (value: $1000)
- Collateral: 1 ETH (value: $1200)
- Liquidation LTV: 90%
- Max Liquidation Discount: 15%

Health Score:
- Adjusted Collateral = $1200 * 90% = $1080
- Health = $1080 / $1000 = 1.08 → HEALTHY (>1.0)

After ETH drops to $1050:
- Adjusted Collateral = $1050 * 90% = $945
- Health = $945 / $1000 = 0.945 → LIQUIDATABLE (<1.0)
- Discount Factor = 0.945
- Discount = 1 - 0.945 = 5.5%

Liquidation:
- Repay: $1000 of debt
- Yield: $1000 / 0.945 = $1058 worth of ETH
- Liquidator profit: $58 (5.5% discount)
```

**Correct (checking liquidation profitability):**

```solidity
import {IEVault} from "evk/EVault/IEVault.sol";

// checkLiquidation returns (0, 0) if account is healthy
(uint256 maxRepay, uint256 maxYield) = IEVault(vault).checkLiquidation(
    liquidator,   // who will receive collateral
    violator,     // unhealthy account
    collateral    // which collateral to seize
);

if (maxRepay == 0) {
    // Account is healthy or no liquidation available
    return;
}

// Calculate profit
// Repay is in debt asset terms, yield is in collateral terms
uint256 repayValueUsd = maxRepay * debtPriceUsd / 1e18;
uint256 yieldValueUsd = maxYield * collateralPriceUsd / 1e18;
uint256 grossProfit = yieldValueUsd - repayValueUsd;

// Account for gas, slippage, swap fees
uint256 netProfit = grossProfit - estimatedCosts;
require(netProfit > 0, "Not profitable");
```

**Correct (executing liquidation):**

```solidity
// liquidate(violator, collateral, repayAssets, minYieldBalance)
// - violator: the unhealthy account
// - collateral: which collateral vault to seize from
// - repayAssets: how much debt to repay (use type(uint256).max for all)
// - minYieldBalance: minimum collateral to receive (slippage protection)

// Must have debt tokens approved
IERC20(debtAsset).approve(vault, repayAmount);

// Execute - this transfers debt from violator to liquidator,
// and seizes collateral from violator to liquidator
IEVault(vault).liquidate(
    violator,
    collateral,
    repayAmount,
    minYieldBalance  // revert if yield < this
);
```

**Liquidation Constraints (from source):**

```solidity
// These checks happen inside calculateLiquidation():

// 1. Cannot self-liquidate
require(violator != liquidator, "E_SelfLiquidation");

// 2. Collateral must have LTV configured (recognized)
require(isRecognizedCollateral(collateral), "E_BadCollateral");

// 3. Vault must be violator's controller
validateController(violator);

// 4. Violator must have enabled this collateral
require(isCollateralEnabled(violator, collateral), "E_CollateralDisabled");

// 5. No deferred status checks (prevents batch manipulation)
require(!isAccountStatusCheckDeferred(violator), "E_ViolatorLiquidityDeferred");

// 6. Must wait for cool-off period after last status check
require(!isInLiquidationCoolOff(violator), "E_LiquidationCoolOff");

// Cool-off check:
bool inCoolOff = block.timestamp < lastStatusCheckTimestamp + liquidationCoolOffTime;
```

**Debt Socialization (bad debt handling):**

```solidity
// Debt socialization occurs when:
// 1. Liability value >= MIN_SOCIALIZATION_LIABILITY_VALUE (1e6 in unit of account)
// 2. CFG_DONT_SOCIALIZE_DEBT flag is NOT set
// 3. Remaining debt after liquidation (liability > repay)
// 4. Violator has no more collateral

// When triggered:
// - Remaining debt is written off
// - Loss is spread across all depositors (share value decreases)
// - Emit DebtSocialized(violator, remainingDebt)

// This protects liquidators from unprofitable liquidations
// when collateral value < debt value
```

**Worthless Collateral Edge Case:**

```solidity
// If collateralValue == 0 (from oracle):
// - Liquidator can claim ALL collateral with NO repay
// - This handles dust amounts or truly worthless assets
// - Profitable only if collateral has hidden value or gas < dust value
if (collateralValue == 0) {
    yieldBalance = collateralBalance;  // Take all
    repay = 0;                          // Pay nothing
}
```

**TypeScript: Complete liquidation bot example:**

```typescript
import { getContract, parseUnits, formatUnits } from 'viem';

async function checkAndLiquidate(
  vault: Address,
  violator: Address,
  collateral: Address
) {
  const vaultContract = getContract({
    address: vault,
    abi: evaultABI,
    client: walletClient
  });

  // Check liquidation opportunity
  const [maxRepay, maxYield] = await vaultContract.read.checkLiquidation([
    liquidatorAddress,
    violator,
    collateral
  ]);

  if (maxRepay === 0n) {
    console.log('Account is healthy');
    return;
  }

  // Get prices for profit calculation
  const debtAsset = await vaultContract.read.asset();
  const debtDecimals = await vaultContract.read.decimals();
  
  // Calculate value (simplified - use oracle in production)
  const repayValue = Number(formatUnits(maxRepay, Number(debtDecimals)));
  const yieldValue = /* calculate from yield amount and price */;
  const discount = (yieldValue - repayValue) / repayValue * 100;

  console.log(`Liquidation available:`);
  console.log(`  Repay: ${repayValue} (debt asset)`);
  console.log(`  Yield: ${yieldValue} (collateral)`);
  console.log(`  Discount: ${discount.toFixed(2)}%`);

  // Approve and execute
  const debtToken = getContract({
    address: debtAsset,
    abi: erc20ABI,
    client: walletClient
  });
  
  await debtToken.write.approve([vault, maxRepay]);
  
  // Set minYield slightly below maxYield for slippage tolerance
  const minYield = maxYield * 99n / 100n;  // 1% slippage
  
  const tx = await vaultContract.write.liquidate([
    violator,
    collateral,
    maxRepay,
    minYield
  ]);

  console.log(`Liquidation executed: ${tx}`);
}
```

**Flash Loan Liquidation (capital-efficient):**

```typescript
// Use EVC batch to atomically:
// 1. Borrow debt asset (using another vault)
// 2. Execute liquidation
// 3. Swap seized collateral for debt asset
// 4. Repay borrowed amount
// 5. Keep profit

const batchItems: BatchItem[] = [
  // Borrow debt tokens from a vault where you have collateral
  {
    onBehalfOfAccount: liquidator,
    targetContract: flashVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'borrow',
      args: [repayAmount, liquidator],
    }),
  },
  // Execute liquidation
  {
    onBehalfOfAccount: liquidator,
    targetContract: debtVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'liquidate',
      args: [violator, collateralVault, repayAmount, minYield],
    }),
  },
  // Swap collateral to debt asset (via DEX)
  {
    onBehalfOfAccount: liquidator,
    targetContract: swapRouter,
    value: 0n,
    data: swapCalldata,
  },
  // Repay flash loan
  {
    onBehalfOfAccount: liquidator,
    targetContract: flashVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'repay',
      args: [repayAmount, liquidator],
    }),
  },
];

await evc.batch(batchItems);
// Health check runs at end - reverts if still unhealthy
```

**Key Parameters:**

| Parameter | Getter | Description |
|-----------|--------|-------------|
| maxLiquidationDiscount | `maxLiquidationDiscount()` | Max discount (e.g., 0.15e4 = 15%) |
| liquidationCoolOffTime | `liquidationCoolOffTime()` | Seconds after status check before liquidatable |
| liquidationLTV | `LTVLiquidation(collateral)` | LTV threshold for liquidation |

Reference: [Liquidation.sol Source](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Liquidation.sol)
