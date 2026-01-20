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

Key concepts:
- Health > 1.0 = safe from liquidation
- Borrow LTV: max health when taking new borrows
- Liquidation LTV: health at which liquidation can occur
- Always maintain buffer above 1.0 for price volatility

Reference: [EVK Risk Manager Module](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/RiskManager.sol)
