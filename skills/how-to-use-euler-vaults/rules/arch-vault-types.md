---
title: Understanding Vault Types (Core, Edge, Escrow)
impact: HIGH
impactDescription: Critical for selecting appropriate vault type for your use case
tags: architecture, vault, core, edge, escrow, perspective
---

## Understanding Vault Types (Core, Edge, Escrow)

Euler V2 has three distinct vault types, each serving different purposes and with different governance characteristics.

**Incorrect (treating all vaults the same):**

```solidity
// WRONG: Not all vaults support borrowing or have the same features
IEVault vault = IEVault(anyVault);
vault.borrow(amount, receiver); // May revert for escrow vaults!
vault.setInterestRateModel(irm); // May not be configurable!
```

**Correct (understanding vault types):**

### 1. Core Vaults (Governed)

Full-featured lending vaults with governance. Created via `GenericFactory` and verified by `GovernedPerspective`.

```solidity
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";
import {IEVault} from "evk/EVault/IEVault.sol";

// Core vaults have full configuration
IEVault coreVault = IEVault(coreVaultAddress);

// Has governor for ongoing management
address governor = coreVault.governorAdmin();

// Full IRM and oracle configuration
address irm = coreVault.interestRateModel();
address oracle = coreVault.oracle();

// Supports all operations: deposit, withdraw, borrow, repay
coreVault.deposit(amount, receiver);
coreVault.borrow(amount, receiver);
```

### 2. Edge Vaults (Ungoverned)

Pre-configured vaults with governance permanently renounced. Created via `EdgeFactory` for specific use cases.

```solidity
import {IEdgeFactory} from "evk-periphery/EdgeFactory/interfaces/IEdgeFactory.sol";

// Edge vaults are deployed with fixed configuration
// Governance is renounced at deployment - no future changes
IEdgeFactory.DeployParams memory params = IEdgeFactory.DeployParams({
    vaults: vaultParams,      // Vault configurations
    router: routerParams,     // Oracle configuration
    ltv: ltvParams,           // LTV relationships
    unitOfAccount: usdAddress // Unit of account
});

(address router, address[] memory vaults) = edgeFactory.deploy(params);

// Edge vaults have NO governor after deployment
IEVault edgeVault = IEVault(vaults[0]);
require(edgeVault.governorAdmin() == address(0), "Ungoverned");
```

### 3. Escrow Vaults (Collateral-Only)

Special vaults that only hold collateral - no borrowing, no IRM, no oracle. Created for pure collateral positions.

```solidity
import {EscrowedCollateralPerspective} from "evk-periphery/Perspectives/deployed/EscrowedCollateralPerspective.sol";

// Escrow vaults are singletons per asset - only one per token
EscrowedCollateralPerspective perspective = EscrowedCollateralPerspective(perspectiveAddress);
address escrowVault = perspective.singletonLookup(assetAddress);

// If not deployed, deploy new escrow vault
if (escrowVault == address(0)) {
    bytes memory trailingData = abi.encodePacked(asset, address(0), address(0));
    escrowVault = GenericFactory(factory).createProxy(address(0), true, trailingData);
    
    // Escrow vaults have minimal config
    IEVault(escrowVault).setHookConfig(address(0), 0);
    IEVault(escrowVault).setGovernorAdmin(address(0));
    
    // Verify in perspective
    perspective.perspectiveVerify(escrowVault, true);
}

// Escrow vault properties:
// - No oracle (address(0))
// - No unit of account (address(0))
// - No IRM (address(0))
// - No caps
// - No hooks
// - No LTV list (cannot be borrowed against directly)
```

**Correct (using Perspectives to verify vault type):**

```typescript
import { getContract } from 'viem';

// Perspectives verify vault properties
const governedPerspective = getContract({
  address: governedPerspectiveAddress,
  abi: perspectiveABI,
  client: publicClient,
});

const escrowPerspective = getContract({
  address: escrowPerspectiveAddress,
  abi: perspectiveABI,
  client: publicClient,
});

// Check if vault is in a perspective
const isGoverned = await governedPerspective.read.isVerified([vaultAddress]);
const isEscrow = await escrowPerspective.read.isVerified([vaultAddress]);

// Perspectives provide trust guarantees
// - GovernedPerspective: vetted by Euler governance
// - EscrowedCollateralPerspective: verified collateral-only vault
// - EVKFactoryPerspective: deployed by official factory
// - EdgeFactoryPerspective: deployed by Edge factory
```

| Feature | Core Vault | Edge Vault | Escrow Vault |
|---------|-----------|------------|--------------|
| Borrowing | ✓ | ✓ | ✗ |
| Governance | ✓ | ✗ (renounced) | ✗ |
| Oracle | ✓ | ✓ (fixed) | ✗ |
| IRM | ✓ | ✓ (fixed) | ✗ |
| Caps | ✓ | ✓ (fixed) | ✗ |
| Can be collateral | ✓ | ✓ | ✓ |

Reference: [EscrowedCollateralPerspective.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/Perspectives/deployed/EscrowedCollateralPerspective.sol), [EdgeFactory.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/EdgeFactory/EdgeFactory.sol)
