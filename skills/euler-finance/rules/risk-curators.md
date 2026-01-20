---
title: Understanding Risk Curators
impact: HIGH
impactDescription: Essential for vault governance and risk management
tags: risk, curator, governance, roles, security
---

## Understanding Risk Curators

Risk Curators are trusted entities responsible for ongoing vault configuration and risk management in Euler V2. They act as stewards of vault parameters.

**Incorrect (assuming anyone can configure vaults):**

```solidity
// WRONG: Only authorized addresses can modify vault config
IEVault vault = IEVault(vaultAddress);
vault.setLTV(collateral, 0.8e4, 0.9e4, 0); // Will revert!
vault.setCaps(1000000e18, 500000e18);       // Will revert!
```

**Correct (understanding governance roles):**

```solidity
import {IEVault} from "evk/EVault/IEVault.sol";

IEVault vault = IEVault(vaultAddress);

// Check governance roles
address governorAdmin = vault.governorAdmin();     // Can change all settings
address feeReceiver = vault.feeReceiver();         // Receives protocol fees

// Governance hierarchy in Euler:
// 1. Governor Admin - full control over vault configuration
// 2. Fee Receiver - receives interest fees
// 3. Hook Target - can implement additional access control

// Only governor can call these functions:
// - setLTV(collateral, borrowLTV, liquidationLTV, rampDuration)
// - setCaps(supplyCap, borrowCap)
// - setInterestRateModel(irm)
// - setInterestFee(fee)
// - setHookConfig(hookTarget, hookedOps)
// - setConfigFlags(flags)
// - setGovernorAdmin(newGovernor)
```

**Correct (implementing risk steward pattern):**

```solidity
import {CapRiskSteward} from "evk-periphery/Governor/CapRiskSteward.sol";

// CapRiskSteward allows limited cap adjustments without full governance
// This enables faster response to market conditions

// Deploy risk steward with limits
CapRiskSteward steward = new CapRiskSteward(
    evc,
    admin,
    3 days,      // riskSteerCooldown: minimum time between adjustments
    0.1e18       // riskSteerCapLimit: max 10% change per adjustment
);

// Add vault to steward management
steward.setRiskSteerVault(vaultAddress, true);

// Steward can adjust caps within limits
steward.setSupplyCap(vaultAddress, newSupplyCap);
steward.setBorrowCap(vaultAddress, newBorrowCap);
```

**Correct (GovernedPerspective for trusted vaults):**

```solidity
import {GovernedPerspective} from "evk-periphery/Perspectives/deployed/GovernedPerspective.sol";

// GovernedPerspective maintains whitelist of trusted vaults
GovernedPerspective perspective = GovernedPerspective(perspectiveAddress);

// Only owner can add/remove vaults
perspective.perspectiveVerify(vaultAddress, true);  // Add to whitelist
perspective.perspectiveUnverify(vaultAddress);       // Remove from whitelist

// Check if vault is verified (trusted)
bool isVerified = perspective.isVerified(vaultAddress);
```

**Risk Curator Responsibilities:**

1. **LTV Configuration**: Setting appropriate borrow and liquidation LTVs for each collateral
2. **Cap Management**: Adjusting supply/borrow caps based on market conditions
3. **IRM Selection**: Choosing appropriate interest rate models
4. **Oracle Configuration**: Ensuring reliable price feeds
5. **Emergency Response**: Pausing operations if issues are detected

**Correct (using Guardian for emergency actions):**

```solidity
import {GovernorGuardian} from "evk-periphery/Governor/GovernorGuardian.sol";

// Guardian can pause vault operations in emergencies
GovernorGuardian guardian = GovernorGuardian(guardianAddress);

// Guardian has limited powers:
// - Can pause/unpause via hook target
// - Cannot change LTVs or other parameters
// - Actions are time-limited

// Example: Pause deposits during incident
// (done via hook target mechanism)
```

**TypeScript: Checking vault governance:**

```typescript
import { getContract } from 'viem';

const vault = getContract({
  address: vaultAddress,
  abi: evaultABI,
  client: publicClient,
});

// Check who governs this vault
const governor = await vault.read.governorAdmin();
const feeReceiver = await vault.read.feeReceiver();
const [hookTarget, hookedOps] = await vault.read.hookConfig();

console.log(`Governor: ${governor}`);
console.log(`Fee Receiver: ${feeReceiver}`);
console.log(`Hook Target: ${hookTarget}`);

// Check if vault is in governed perspective (Euler-vetted)
const perspective = getContract({
  address: governedPerspectiveAddress,
  abi: perspectiveABI,
  client: publicClient,
});

const isEulerVerified = await perspective.read.isVerified([vaultAddress]);
console.log(`Euler Verified: ${isEulerVerified}`);
```

When integrating with Euler, prefer vaults verified in `GovernedPerspective` as they have been reviewed by Euler's risk team.

Reference: [CapRiskSteward.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/Governor/CapRiskSteward.sol)
