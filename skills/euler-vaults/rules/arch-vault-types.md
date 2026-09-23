---
title: Understanding Vault Types (Governed, Ungoverned, Escrowed Collateral)
impact: HIGH
impactDescription: Critical for selecting appropriate vault type for your use case
tags: architecture, vault, governed, ungoverned, escrow, perspective
---

## Understanding Vault Types (Governed, Ungoverned, Escrowed Collateral)

Euler V2 vaults fall into two main categories based on governance: **Governed** (with active governance) and **Ungoverned** (governance renounced). Escrowed Collateral vaults are a special subtype of ungoverned vaults designed for collateral-only use cases.

**Incorrect (treating all vaults the same):**

```solidity
// WRONG: Not all vaults support borrowing or have the same features
IEVault vault = IEVault(anyVault);
vault.borrow(amount, receiver); // May revert for escrow vaults!
vault.setInterestRateModel(irm); // May not be configurable!
```

**Correct (understanding vault types):**

### 1. Governed Vaults

Full-featured lending vaults with active governance (risk management). The governor can update parameters like LTV, caps, IRM, and oracle configuration over time.

> ⚠️ **Trust Warning:** Users must fully trust the governor address. The governor has significant power over vault parameters and could potentially act maliciously (e.g., setting dangerous LTVs, changing oracles, or extracting fees). Always verify who controls governance before depositing - whether it's an EOA, multisig, DAO, or limited governor contract.

```solidity
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";
import {IEVault} from "evk/EVault/IEVault.sol";

// Governed vaults have full configuration capabilities
IEVault vault = IEVault(vaultAddress);

// Has governor for ongoing management
address governor = vault.governorAdmin();
require(governor != address(0), "This is a governed vault");

// Governor can update configuration
vault.setInterestRateModel(newIRM);
vault.setLTV(collateral, borrowLTV, liquidationLTV, rampDuration);
vault.setCaps(supplyCap, borrowCap);

// Supports all operations: deposit, withdraw, borrow, repay
vault.deposit(amount, receiver);
vault.borrow(amount, receiver);
```

**Limited governance permissions:**

`GovernorAccessControl` can give a CapRiskSteward bounded cap and IRM permissions while retaining other governance roles. The steward forwards calls through the governor and identifies the target vault in trailing calldata. See [Risk Managers](https://github.com/euler-xyz/agent-skills/blob/main/skills/euler-vaults/rules/risk-managers.md) for the constructor, permission layers, and call encoding.

### 2. Ungoverned Vaults

Vaults with governance permanently renounced (`governorAdmin == address(0)`). Configuration is fixed at deployment and cannot be changed. This provides immutability guarantees but no flexibility.

```solidity
// Ungoverned vaults have fixed configuration
IEVault vault = IEVault(vaultAddress);

// Governor is address(0) - no one can change parameters
require(vault.governorAdmin() == address(0), "Ungoverned vault");

// These calls will revert with E_Unauthorized:
// vault.setInterestRateModel(newIRM);  // Cannot change
// vault.setLTV(collateral, ltv, ltv, 0);  // Cannot change
// vault.setCaps(cap, cap);  // Cannot change

// Normal operations still work
vault.deposit(amount, receiver);
vault.borrow(amount, receiver);  // If borrowing is configured
```

### 3. Escrowed Collateral Vaults (Ungoverned Subtype)

Special ungoverned vaults designed purely for holding collateral. They have no oracle, no IRM, and no borrowing capability and are neutral (can be reused by anyone). One escrow vault exists per asset (singleton pattern).

```solidity
import {EscrowedCollateralPerspective} from "evk-periphery/Perspectives/deployed/EscrowedCollateralPerspective.sol";

// Escrow vaults are singletons per asset - only one per token
EscrowedCollateralPerspective perspective = EscrowedCollateralPerspective(perspectiveAddress);
address escrowVault = perspective.singletonLookup(assetAddress);

// If not deployed, deploy new escrow vault
if (escrowVault == address(0)) {
    bytes memory trailingData = abi.encodePacked(asset, address(0), address(0));
    escrowVault = GenericFactory(factory).createProxy(address(0), true, trailingData);

    // Escrow vaults have minimal config and renounced governance
    IEVault(escrowVault).setHookConfig(address(0), 0);
    IEVault(escrowVault).setGovernorAdmin(address(0));

    // Verify in perspective so that others can reuse this vault later
    perspective.perspectiveVerify(escrowVault, true);
}

// Escrow vault properties:
// - No oracle (address(0))
// - No unit of account (address(0))
// - No IRM (address(0))
// - No caps
// - No hooks
// - No LTV list (cannot be borrowed against directly)
// - Governance renounced (address(0))
```

**Correct (separating provenance, governance, and escrow classification):**

```typescript
const isFactoryVault = await evaultFactory.read.isProxy([vaultAddress]);
if (!isFactoryVault) throw new Error('Unknown vault provenance');

const governor = await publicClient.readContract({
  address: vaultAddress, abi: evaultABI, functionName: 'governorAdmin',
});
const isUngoverned = governor === zeroAddress;
const isEscrow = await escrowPerspective.read.isVerified([vaultAddress]);
```

Resolve the factory and maintained `EscrowedCollateralPerspective` addresses from current chain deployments. Factory provenance does not endorse a vault's risk configuration. In SDK results, use the `isEscrow` classification rather than inferring escrow status solely from `vaultType`; governance is a separate property.

| Feature | Governed Vault | Ungoverned Vault | Escrowed Collateral |
|---------|----------------|------------------|---------------------|
| Borrowing | ✓ | ✓ (if configured) | ✗ |
| Governance | ✓ | ✗ (renounced) | ✗ (renounced) |
| Oracle | ✓ | ✓ (fixed) | ✗ |
| IRM | ✓ | ✓ (fixed) | ✗ |
| Caps | ✓ | ✓ (fixed) | ✗ |
| Can be collateral | ✓ | ✓ | ✓ |
| Config changeable | ✓ | ✗ | ✗ |

Reference: [EscrowedCollateralPerspective.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/Perspectives/deployed/EscrowedCollateralPerspective.sol)
