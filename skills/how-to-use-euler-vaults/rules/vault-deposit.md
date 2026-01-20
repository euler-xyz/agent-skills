---
title: Deposit Assets into a Vault
impact: CRITICAL
impactDescription: Fundamental operation for supplying liquidity
tags: vault, deposit, erc4626, supply, collateral
---

## Deposit Assets into a Vault

Depositing assets into an Euler vault is the first step to earning yield or using assets as collateral. Euler vaults are ERC-4626 compliant.

**Incorrect (forgetting to approve tokens first):**

```solidity
// This will revert - vault cannot pull tokens without approval
IEVault(vault).deposit(amount, receiver);
```

**Correct (approve then deposit):**

```solidity
// Step 1: Approve the vault to spend your tokens
IERC20(asset).approve(vault, amount);

// Step 2: Deposit assets and receive vault shares
// - amount: the amount of underlying assets to deposit
// - receiver: address that will receive the vault shares
uint256 shares = IEVault(vault).deposit(amount, receiver);
```

**Correct (using Permit2 for gasless approvals):**

```typescript
import { signPermit2 } from '@eulerxyz/euler-sdk';

// Euler vaults support Permit2 for single-transaction deposits
const permit2Signature = await signPermit2({
  token: assetAddress,
  amount: depositAmount,
  spender: vaultAddress,
  deadline: Math.floor(Date.now() / 1000) + 3600,
});

// Batch via EVC for atomic approval + deposit
const batchItems = [
  {
    targetContract: permit2Address,
    onBehalfOfAccount: userAddress,
    value: 0n,
    data: encodePermit2Transfer(permit2Signature),
  },
  {
    targetContract: vaultAddress,
    onBehalfOfAccount: userAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: eVaultABI,
      functionName: 'deposit',
      args: [depositAmount, userAddress],
    }),
  },
];

await evc.batch(batchItems);
```

**Correct (using mint instead of deposit):**

```solidity
// Alternative: specify exact shares you want to receive
// Useful when you need a precise share amount
uint256 assetsRequired = IEVault(vault).previewMint(sharesWanted);
IERC20(asset).approve(vault, assetsRequired);
uint256 assets = IEVault(vault).mint(sharesWanted, receiver);
```

After depositing, you can enable the vault as collateral via EVC to borrow from other vaults:

```solidity
// Enable this vault as collateral for your account
IEVC(evc).enableCollateral(account, vault);
```

Reference: [ERC-4626 Standard](https://eips.ethereum.org/EIPS/eip-4626)
