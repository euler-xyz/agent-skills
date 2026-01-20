---
title: Understanding Euler Market Design
impact: HIGH
impactDescription: Fundamental knowledge for building on Euler V2
tags: architecture, market, design, vault, modular
---

## Understanding Euler Market Design

Euler V2 uses a modular "vault kit" architecture where each market is an independent ERC-4626 vault with its own configuration for oracle, interest rate model, and collateral relationships.

**Incorrect (assuming monolithic pool like Compound/Aave):**

```solidity
// WRONG: There's no single "Euler pool" to interact with
// Each asset has its own vault(s) with independent configuration
address eulerPool = 0x...;
IPool(eulerPool).deposit(USDC, amount); // This doesn't exist!
```

**Correct (understanding independent vault architecture):**

```solidity
import {IEVault} from "evk/EVault/IEVault.sol";
import {IEVC} from "ethereum-vault-connector/interfaces/IEVC.sol";

// Each vault is independent - there can be multiple USDC vaults
// with different configurations (oracle, IRM, collaterals)
address usdcVault = 0x...; // A specific USDC vault

// Vaults are standard ERC-4626 with extensions
IEVault vault = IEVault(usdcVault);

// Key vault properties
address asset = vault.asset();           // Underlying token
address oracle = vault.oracle();         // Price oracle (EulerRouter)
address irm = vault.interestRateModel(); // Interest rate model
address unitOfAccount = vault.unitOfAccount(); // Price denomination

// Collateral relationships are vault-to-vault
// This vault accepts another vault's shares as collateral
address[] memory collaterals = vault.LTVList();
(uint16 borrowLTV, uint16 liquidationLTV, , ) = vault.LTVFull(collateralVault);
```

**Correct (understanding the EVC layer):**

```solidity
// The EVC (Ethereum Vault Connector) orchestrates cross-vault operations
IEVC evc = IEVC(0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383);

// Accounts enable a vault as collateral for their positions
evc.enableCollateral(account, collateralVault);

// Accounts enable a vault as controller (to borrow from)
evc.enableController(account, borrowVault);

// The controller vault checks all collateral vaults to ensure solvency
// This happens automatically during deferred checks
```

**Key Architecture Concepts:**

1. **Vaults are ERC-4626**: Standard deposit/withdraw interface plus borrowing extensions
2. **Oracles per vault**: Each vault has its own EulerRouter for price resolution
3. **Unit of Account**: Common price denomination (usually USD or ETH) for LTV calculations
4. **Collateral is vault shares**: When you deposit, you get vault shares that can be collateral
5. **Controller relationship**: The vault you borrow from is your "controller"
6. **LTV is vault-to-vault**: Each collateral-controller pair has specific LTV settings

```typescript
// TypeScript example: querying vault configuration
import { getContract } from 'viem';

const vault = getContract({
  address: vaultAddress,
  abi: evaultABI,
  client: publicClient,
});

// Get all accepted collaterals for this vault
const ltvList = await vault.read.LTVList();

// For each collateral, get LTV configuration
for (const collateral of ltvList) {
  const [borrowLTV, liquidationLTV, initialLTV, targetTimestamp, rampDuration] = 
    await vault.read.LTVFull([collateral]);
  
  console.log(`Collateral ${collateral}:`);
  console.log(`  Borrow LTV: ${borrowLTV / 100}%`);
  console.log(`  Liquidation LTV: ${liquidationLTV / 100}%`);
}
```

This modular design allows for permissionless market creation - anyone can deploy a vault with custom parameters while the EVC provides the security layer for cross-vault interactions.

Reference: [EVK Whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)
