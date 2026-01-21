---
title: Check Account Health Factor
impact: HIGH
impactDescription: Critical for avoiding liquidation
tags: risk, health, liquidation, ltv, collateral
---

## Check Account Health Factor

Health factor determines how close an account is to liquidation. A health factor below 1.0 means the account can be liquidated. Monitoring health is essential for safe position management.

**Incorrect (only checking debt amount):**

```solidity
// Debt amount alone doesn't indicate liquidation risk
uint256 debt = IEVault(vault).debtOf(account);
// This tells you nothing about health - need to compare against collateral value
```

**Correct (using AccountLens for health check):**

```typescript
import { AccountLens } from '@eulerxyz/evk-periphery';

// Get comprehensive account health info
// accountLens.getAccountInfo(account, vault) returns AccountInfo struct
const accountInfo = await accountLens.read.getAccountInfo([account, controller]);

// Access liquidity info from vaultAccountInfo
const liquidityInfo = accountInfo.vaultAccountInfo.liquidityInfo;

// Check if query succeeded (liquidityInfo.queryFailure === false)
if (liquidityInfo.queryFailure) {
  console.error('Liquidity query failed:', liquidityInfo.queryFailureReason);
  return;
}

// For liquidation health: collateralValueLiquidation / liabilityValueLiquidation
const collateralValueLiq = liquidityInfo.collateralValueLiquidation;
const liabilityValueLiq = liquidityInfo.liabilityValueLiquidation;

// Calculate health: > 1.0 = healthy, < 1.0 = can be liquidated
const health = liabilityValueLiq > 0n 
  ? (collateralValueLiq * BigInt(1e18)) / liabilityValueLiq 
  : BigInt(2n ** 256n - 1n); // Infinite if no debt

// timeToLiquidation: estimated seconds until liquidation
// Negative means already liquidatable, special values:
// TTL_INFINITY = max int256 (no debt or safe forever)
// TTL_LIQUIDATION = min int256 (already liquidatable)
// TTL_ERROR = max int256 - 1 (calculation error)
const ttl = liquidityInfo.timeToLiquidation;

console.log(`Health: ${Number(health) / 1e18}`);
console.log(`Liability: ${liabilityValueLiq}`);
console.log(`Collateral: ${collateralValueLiq}`);
console.log(`Time to Liquidation: ${ttl}`);
```

**Correct (on-chain health check via vault):**

```solidity
// Check if account status is valid (will revert if unhealthy)
// This is what vaults call during operations
try IEVault(controller).checkAccountStatus(account, collaterals) {
    // Account is healthy
} catch {
    // Account would fail health check
}

// Alternative: Use the EVC to check
(bool isHealthy, ) = IEVC(evc).call(
    account,
    address(controller),
    abi.encodeCall(IEVault.checkAccountStatus, (account, collaterals))
);
```

**Correct (calculating health factor manually):**

```solidity
/// @notice Calculate health factor for an account
/// @param account The account to check
/// @param controller The liability vault (controller)
/// @return healthFactor The health ratio (1e18 = 1.0)
function calculateHealthFactor(
    address account,
    address controller
) public view returns (uint256 healthFactor) {
    // Get debt value in unit of account
    uint256 debtValue = getDebtValue(account, controller);
    if (debtValue == 0) return type(uint256).max; // No debt = infinite health
    
    // Get risk-adjusted collateral value
    uint256 collateralValue = 0;
    address[] memory collaterals = IEVC(evc).getCollaterals(account);
    
    for (uint256 i = 0; i < collaterals.length; i++) {
        address collateral = collaterals[i];
        
        // Get collateral amount
        uint256 shares = IEVault(collateral).balanceOf(account);
        uint256 assets = IEVault(collateral).convertToAssets(shares);
        
        // Get LTV for this collateral relative to controller
        uint16 liquidationLTV = IEVault(controller).LTVLiquidation(collateral);
        
        // Get collateral price in unit of account
        uint256 price = getPrice(collateral, controller);
        
        // Risk-adjusted value
        collateralValue += (assets * price * liquidationLTV) / (1e18 * 1e4);
    }
    
    // Health factor = collateral / debt
    healthFactor = (collateralValue * 1e18) / debtValue;
}
```

**Correct (setting up health monitoring):**

```typescript
// Monitor health and alert when below threshold
const HEALTH_THRESHOLD = 1.2e18; // Alert at 1.2 health

async function monitorHealth(account: Address, controller: Address) {
  const accountInfo = await accountLens.read.getAccountInfo([account, controller]);
  const liquidityInfo = accountInfo.vaultAccountInfo.liquidityInfo;
  
  const collateral = liquidityInfo.collateralValueLiquidation;
  const liability = liquidityInfo.liabilityValueLiquidation;
  
  if (liability === 0n) {
    console.log('No debt - infinite health');
    return;
  }
  
  const health = (collateral * BigInt(1e18)) / liability;
  
  if (health < BigInt(HEALTH_THRESHOLD)) {
    console.warn(`⚠️ Low health: ${Number(health) / 1e18}`);
    
    // Calculate required collateral to reach safe health
    const targetHealth = 1.5e18;
    const requiredCollateral = (liability * BigInt(targetHealth)) / BigInt(1e18) - collateral;
    
    console.log(`Need ${requiredCollateral} more collateral value for 1.5 health`);
  }
}

// Run monitoring loop
setInterval(() => monitorHealth(account, controller), 60000);
```

**Correct (using vault's accountLiquidity directly):**

```solidity
// accountLiquidity returns risk-adjusted values directly from the vault
// This is what the vault uses internally for health checks

// For borrow LTV (determines if you can borrow more)
(uint256 collateralValue, uint256 liabilityValue) = IEVault(controller).accountLiquidity(
    account,
    false  // liquidation = false uses borrow LTV
);

// Health = collateralValue / liabilityValue
// If collateralValue >= liabilityValue, account is healthy for borrowing
bool canBorrow = collateralValue >= liabilityValue;

// For liquidation LTV (determines if account can be liquidated)
(uint256 collateralValueLiq, uint256 liabilityValueLiq) = IEVault(controller).accountLiquidity(
    account,
    true   // liquidation = true uses liquidation LTV
);

// If collateralValueLiq < liabilityValueLiq, account is liquidatable
bool isLiquidatable = collateralValueLiq < liabilityValueLiq;
```

**Correct (detailed breakdown with accountLiquidityFull):**

```solidity
// accountLiquidityFull returns per-collateral breakdown
(
    address[] memory collaterals,
    uint256[] memory collateralValues,
    uint256 liabilityValue
) = IEVault(controller).accountLiquidityFull(account, true);

// Analyze each collateral's contribution
for (uint256 i = 0; i < collaterals.length; i++) {
    console.log("Collateral:", collaterals[i]);
    console.log("Value:", collateralValues[i]);
    
    // Calculate this collateral's contribution percentage
    uint256 totalCollateral = sumArray(collateralValues);
    uint256 contribution = collateralValues[i] * 100 / totalCollateral;
    console.log("Contribution:", contribution, "%");
}

console.log("Total Liability:", liabilityValue);
```

**TypeScript: Using accountLiquidity:**

```typescript
const vault = getContract({
  address: controllerAddress,
  abi: evaultABI,
  client: publicClient
});

// Get liquidity with borrow LTV
const [collateralBorrow, liabilityBorrow] = await vault.read.accountLiquidity([
  account,
  false  // borrow LTV
]);

// Get liquidity with liquidation LTV
const [collateralLiq, liabilityLiq] = await vault.read.accountLiquidity([
  account,
  true   // liquidation LTV
]);

// Calculate both health factors
const borrowHealth = liabilityBorrow > 0n 
  ? (collateralBorrow * 10n ** 18n) / liabilityBorrow 
  : MaxUint256;

const liquidationHealth = liabilityLiq > 0n
  ? (collateralLiq * 10n ** 18n) / liabilityLiq
  : MaxUint256;

console.log(`Borrow Health: ${formatUnits(borrowHealth, 18)}`);
console.log(`Liquidation Health: ${formatUnits(liquidationHealth, 18)}`);

// Full breakdown
const [collaterals, values, liability] = await vault.read.accountLiquidityFull([
  account,
  true
]);

for (let i = 0; i < collaterals.length; i++) {
  console.log(`${collaterals[i]}: ${formatUnits(values[i], 18)} value`);
}
```

**Correct (disabling controller after full repayment):**

```solidity
// After fully repaying debt, you can disable the controller
// This releases your collateral from the vault's control

// First, ensure debt is zero
uint256 debt = IEVault(controller).debtOf(account);
require(debt == 0, "Outstanding debt");

// Disable controller - must be called by the account owner
// Note: This is called ON the controller vault, not the EVC
IEVault(controller).disableController();

// Now you can:
// 1. Disable collateral: IEVC(evc).disableCollateral(account, collateralVault)
// 2. Withdraw freely without health checks
```

**TypeScript: Full repay and disable flow:**

```typescript
const batchItems: BatchItem[] = [
  // Repay all debt
  {
    onBehalfOfAccount: account,
    targetContract: controllerVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'repay',
      args: [MaxUint256, account],
    }),
  },
  // Disable controller
  {
    onBehalfOfAccount: account,
    targetContract: controllerVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'disableController',
      args: [],
    }),
  },
  // Disable collateral (optional - via EVC)
  {
    onBehalfOfAccount: zeroAddress,
    targetContract: evcAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: evcABI,
      functionName: 'disableCollateral',
      args: [account, collateralVault],
    }),
  },
  // Withdraw collateral
  {
    onBehalfOfAccount: account,
    targetContract: collateralVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'withdraw',
      args: [MaxUint256, account, account],
    }),
  },
];

await evc.batch(batchItems);
```

**Understanding checkAccountStatus and checkVaultStatus:**

```solidity
// These are EVC callback functions - NOT meant to be called directly by users
// The EVC calls them during deferred checks at the end of batches

// checkAccountStatus: Called by EVC to verify account health
// - Reverts if account is unhealthy (collateral < liability)
// - Returns magic value on success
bytes4 magic = IEVault(controller).checkAccountStatus(account, collaterals);
// magic == IEVCVault.checkAccountStatus.selector

// checkVaultStatus: Called by EVC to verify vault caps
// - Checks supply and borrow caps aren't exceeded
// - Reverts with E_SupplyCapExceeded or E_BorrowCapExceeded
// - Also triggers interest rate recalculation
bytes4 magic = IEVault(vault).checkVaultStatus();
```

Key concepts:
- Health > 1.0 = safe from liquidation
- Borrow LTV: max health when taking new borrows
- Liquidation LTV: health at which liquidation can occur
- Always maintain buffer above 1.0 for price volatility
- `accountLiquidity(account, false)` = borrow LTV values
- `accountLiquidity(account, true)` = liquidation LTV values
- Call `disableController()` after full repayment to release position

See also: [Lens Contracts](tools-lens) - AccountLens provides `getAccountLiquidityInfo()` and `getTimeToLiquidation()` for comprehensive health monitoring.

Reference: [EVK Risk Manager Module](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/RiskManager.sol)
