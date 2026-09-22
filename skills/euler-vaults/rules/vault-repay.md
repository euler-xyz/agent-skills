---
title: Repay Borrowed Debt
impact: HIGH
impactDescription: Essential for managing debt and avoiding liquidation
tags: vault, repay, debt, interest
---

## Repay Borrowed Debt

Repaying debt reduces your borrow balance and improves your health factor. Interest accrues continuously, so the debt amount increases over time.

**Incorrect (repaying exact original borrow amount):**

```solidity
// Interest has accrued - this won't fully repay the debt
uint256 originalBorrow = 1000e18;
IERC20(asset).approve(vault, originalBorrow);
IEVault(vault).repay(originalBorrow, account);
// Still has dust debt remaining!
```

**Correct (partial repay - specify exact amount):**

```solidity
// Get current debt to understand position
uint256 currentDebt = IEVault(vault).debtOf(account);

// Repay a specific amount (must be <= current debt, otherwise reverts)
uint256 repayAmount = currentDebt / 2; // repay half
IERC20(asset).approve(vault, repayAmount);
IEVault(vault).repay(repayAmount, account);
```

**Correct (full repay - use type(uint256).max):**

```solidity
// To repay ALL debt, use type(uint256).max
// This is the only safe way to clear debt completely (handles interest accrual)
// IMPORTANT: Repaying more than owed will REVERT - do not add buffers

// Approve enough to cover debt
uint256 currentDebt = IEVault(vault).debtOf(account);
IERC20(asset).approve(vault, currentDebt + (currentDebt / 100)); // small buffer for approval only

// Use max value to repay - pulls exactly what's owed
IEVault(vault).repay(type(uint256).max, account);
```

**Correct (repay with vault shares instead of underlying):**

```solidity
// repayWithShares burns your vault shares to repay debt
// Useful when you have shares but not the underlying asset

// Get current debt and share balance
uint256 myDebt = IEVault(vault).debtOf(account);
uint256 myShares = IEVault(vault).balanceOf(account);

// Repay using shares - returns (shares burned, assets repaid)
// amount = type(uint256).max uses all shares
(uint256 sharesBurned, uint256 assetsRepaid) = IEVault(vault).repayWithShares(
    type(uint256).max,  // or specific amount of assets to repay
    account             // whose debt to repay
);

// If shares value > debt, only burns shares worth the debt
// The conversion uses toAssetsDown for shares, toSharesUp for rounding
```

**TypeScript: repayWithShares example:**

For a direct owner-wallet position, simulate to inspect the predicted return values, then confirm the write through its receipt and resulting state. For a synthetic sub-account, encode this call into an EVC batch with that position as `onBehalfOfAccount`.

```typescript
const { request, result } = await publicClient.simulateContract({
  address: vaultAddress,
  abi: evaultABI,
  functionName: 'repayWithShares',
  args: [MaxUint256, ownerAddress],
  account: ownerAddress,
});
const [predictedSharesBurned, predictedAssetsRepaid] = result;
console.log({ predictedSharesBurned, predictedAssetsRepaid });

const hash = await walletClient.writeContract(request);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success') throw new Error('Repayment reverted');
const remainingDebt = await publicClient.readContract({
  address: vaultAddress, abi: evaultABI, functionName: 'debtOf',
  args: [ownerAddress],
});
console.log({ hash, remainingDebt });
```

Simulation results describe the simulated state; the transaction hash is not a tuple of Solidity return values. Reconcile confirmed state before declaring the position closed.

After fully repaying:
- The controller can be released, freeing your collateral
- You can withdraw collateral or use it elsewhere
- Sub-account becomes available for new positions

Reference: [EVault Borrowing Module](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Borrowing.sol)
