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

**Correct (query current debt and repay with buffer):**

```solidity
// Get the current debt amount (includes accrued interest)
uint256 currentDebt = IEVault(vault).debtOf(account);

// Add a small buffer for interest accruing during tx
uint256 repayAmount = currentDebt + (currentDebt / 1000); // 0.1% buffer

IERC20(asset).approve(vault, repayAmount);

// Repay - excess will be refunded or you can use type(uint256).max
uint256 actualRepaid = IEVault(vault).repay(currentDebt, account);
```

**Correct (repay max to clear all debt):**

```solidity
// Use type(uint256).max to repay entire debt
// This handles interest accrual automatically
uint256 maxDebt = IEVault(vault).debtOf(account);

// Approve enough to cover debt plus any interest during tx
IERC20(asset).approve(vault, type(uint256).max);

// This will repay exactly the current debt amount
IEVault(vault).repay(type(uint256).max, account);

// After full repayment, disable controller if not needed
// Only the controller vault can disable itself
// This happens automatically if debt reaches zero
```

**Correct (partial repay to improve health factor):**

```typescript
// Calculate how much to repay to reach target health factor
const currentDebt = await vault.debtOf(account);
const currentHealth = await accountLens.getAccountHealth(account);

// Repay enough to reach 1.5 health factor
const targetHealth = 1.5e18;
const requiredRepay = calculateRepayForHealth(
  currentDebt,
  currentHealth,
  targetHealth
);

await asset.approve(vault, requiredRepay);
await vault.repay(requiredRepay, account);
```

After fully repaying:
- The controller can be released, freeing your collateral
- You can withdraw collateral or use it elsewhere
- Sub-account becomes available for new positions

Reference: [EVault Borrowing Module](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Borrowing.sol)
