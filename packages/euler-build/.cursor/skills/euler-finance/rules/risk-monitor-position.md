---
title: Monitor Position Health
impact: HIGH
impactDescription: Continuous monitoring prevents unexpected liquidation
tags: risk, monitoring, position, alerts, automation
---

## Monitor Position Health

Continuous position monitoring is essential for DeFi risk management. Price movements can quickly change health factors, and timely responses can prevent liquidation losses.

**Incorrect (checking health only at deposit/borrow time):**

```solidity
// Health at borrow time doesn't protect you later
uint256 healthAtBorrow = calculateHealth(account);
require(healthAtBorrow > 1.2e18, "Insufficient health");
IEVault(vault).borrow(amount, account);
// Days later, prices move and account gets liquidated!
```

**Correct (comprehensive position monitoring):**

```typescript
import { VaultLens, AccountLens } from '@eulerxyz/evk-periphery';

interface PositionStatus {
  account: Address;
  controller: Address;
  healthFactor: bigint;
  totalDebt: bigint;
  totalCollateral: bigint;
  collaterals: CollateralInfo[];
  riskLevel: 'safe' | 'warning' | 'danger' | 'liquidatable';
}

async function getPositionStatus(
  account: Address,
  controller: Address
): Promise<PositionStatus> {
  const accountInfo = await accountLens.getAccountInfo(account, controller);
  const collaterals = await evc.getCollaterals(account);
  
  // Gather collateral details
  const collateralInfos = await Promise.all(
    collaterals.map(async (vault) => {
      const vaultInfo = await vaultLens.getVaultInfoDynamic(vault);
      const balance = await IEVault(vault).balanceOf(account);
      const ltv = await IEVault(controller).LTVLiquidation(vault);
      
      return {
        vault,
        balance,
        value: vaultInfo.shareValue * balance / 1e18,
        ltv,
      };
    })
  );
  
  // Determine risk level
  const health = accountInfo.healthScore;
  let riskLevel: PositionStatus['riskLevel'];
  
  if (health < 1e18) riskLevel = 'liquidatable';
  else if (health < 1.1e18) riskLevel = 'danger';
  else if (health < 1.3e18) riskLevel = 'warning';
  else riskLevel = 'safe';
  
  return {
    account,
    controller,
    healthFactor: health,
    totalDebt: accountInfo.liabilityValue,
    totalCollateral: accountInfo.collateralValueBorrowing,
    collaterals: collateralInfos,
    riskLevel,
  };
}
```

**Correct (automated monitoring with alerts):**

```typescript
const ALERT_THRESHOLDS = {
  warning: 1.3e18,  // 1.3 health - send warning
  danger: 1.15e18,  // 1.15 health - urgent action needed
  critical: 1.05e18 // 1.05 health - immediate intervention
};

class PositionMonitor {
  private positions: Map<string, PositionStatus> = new Map();
  
  async monitor(accounts: Address[], controller: Address) {
    for (const account of accounts) {
      const status = await getPositionStatus(account, controller);
      const key = `${account}-${controller}`;
      const previous = this.positions.get(key);
      
      // Check for risk level changes
      if (!previous || previous.riskLevel !== status.riskLevel) {
        await this.handleRiskChange(status, previous?.riskLevel);
      }
      
      // Check for rapid health decline
      if (previous) {
        const healthDrop = previous.healthFactor - status.healthFactor;
        const dropPercent = (healthDrop * 100n) / previous.healthFactor;
        
        if (dropPercent > 10n) {
          await this.alertRapidDecline(status, dropPercent);
        }
      }
      
      this.positions.set(key, status);
    }
  }
  
  private async handleRiskChange(
    status: PositionStatus, 
    previousLevel?: string
  ) {
    switch (status.riskLevel) {
      case 'warning':
        console.warn(`⚠️ Health warning: ${status.healthFactor / 1e18}`);
        // Send notification
        break;
      case 'danger':
        console.error(`🚨 Danger: Health at ${status.healthFactor / 1e18}`);
        // Trigger automated protection
        await this.initiateProtection(status);
        break;
      case 'liquidatable':
        console.error(`💀 Liquidatable! Health: ${status.healthFactor / 1e18}`);
        // Emergency response
        break;
    }
  }
  
  private async initiateProtection(status: PositionStatus) {
    // Options:
    // 1. Add more collateral
    // 2. Partial repay
    // 3. Close position entirely
    console.log('Initiating automated protection...');
  }
}

// Run monitor every 30 seconds
const monitor = new PositionMonitor();
setInterval(() => monitor.monitor(watchedAccounts, controller), 30000);
```

**Correct (on-chain monitoring with keeper):**

```solidity
contract HealthKeeper {
    IEVC public immutable evc;
    uint256 public constant PROTECTION_THRESHOLD = 1.15e18;
    
    // Track positions that want protection
    mapping(address => mapping(address => bool)) public watchedPositions;
    
    function registerForProtection(address account, address controller) 
        external 
    {
        require(
            msg.sender == IEVC(evc).getAccountOwner(account),
            "Not owner"
        );
        watchedPositions[account][controller] = true;
    }
    
    function executeProtection(
        address account,
        address controller,
        uint256 repayAmount
    ) external {
        require(watchedPositions[account][controller], "Not watched");
        
        // Check health is below threshold
        uint256 health = calculateHealth(account, controller);
        require(health < PROTECTION_THRESHOLD, "Health sufficient");
        
        // Execute protection action (requires operator authorization)
        IEVC.BatchItem[] memory items = new IEVC.BatchItem[](1);
        items[0] = IEVC.BatchItem({
            onBehalfOfAccount: account,
            targetContract: controller,
            value: 0,
            data: abi.encodeCall(IEVault.repay, (repayAmount, account))
        });
        
        evc.batch(items);
    }
}
```

Key practices:
- Monitor health at regular intervals (30s-5min)
- Set up alerts at multiple threshold levels
- Automate protection actions where possible
- Track price volatility of collateral assets
- Consider setting up operator-based keepers

See also: [Lens Contracts for Data Queries](tools-lens) for complete AccountLens and VaultLens documentation.

Reference: [Euler Docs - Liquidation Bot](https://docs.euler.finance/creator-tools/liquidation-bot/)
