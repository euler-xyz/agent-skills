---
title: Flash Loans and Debt Transfer
impact: HIGH
impactDescription: Advanced borrowing operations for arbitrage and debt management
tags: flashloan, pulldebt, debt, transfer, arbitrage
---

## Flash Loans and Debt Transfer

Euler vaults support flash loans (borrow and repay in same transaction) and debt transfer (pullDebt to take on another account's debt).

**Incorrect (not repaying flash loan in same transaction):**

```solidity
// WRONG: Flash loan MUST be repaid in same transaction
contract BadFlashBorrower {
    function attemptFlashLoan(address vault, uint256 amount) external {
        IEVault(vault).flashLoan(amount, "");
        // Missing repayment! This will revert with E_FlashLoanNotRepaid
    }
    
    function onFlashLoan(bytes memory) external {
        // Trying to keep the funds - WILL FAIL
        // Vault checks balance after callback returns
    }
}
```

**Correct (flash loan with proper repayment):**

```solidity
import {IFlashLoan} from "evk/interfaces/IFlashLoan.sol";

// Flash loans on Euler are FREE (no fee)
// Must implement IFlashLoan interface and repay in same tx

contract MyFlashBorrower is IFlashLoan {
    function executeFlashLoan(address vault, uint256 amount) external {
        // Request flash loan - vault transfers assets to this contract
        IEVault(vault).flashLoan(amount, abi.encode(/* your data */));
    }
    
    // Vault calls this after transferring assets
    function onFlashLoan(bytes memory data) external override {
        // Decode your data
        // ... do arbitrage, liquidation, etc ...
        
        // MUST return assets to vault before function ends
        // Vault checks: balanceOf(vault) >= originalBalance
        IERC20(asset).transfer(msg.sender, amount);
    }
}
```

**Flash Loan for Liquidation:**

```solidity
contract FlashLiquidator is IFlashLoan {
    IEVC public immutable evc;
    
    function liquidateWithFlash(
        address debtVault,
        address collateralVault,
        address violator,
        uint256 repayAmount
    ) external {
        // Flash borrow the debt asset
        IEVault(debtVault).flashLoan(
            repayAmount,
            abi.encode(debtVault, collateralVault, violator, repayAmount)
        );
    }
    
    function onFlashLoan(bytes memory data) external override {
        (address debtVault, address collateralVault, address violator, uint256 repayAmount) = 
            abi.decode(data, (address, address, address, uint256));
        
        address asset = IEVault(debtVault).asset();
        
        // Approve vault to take repayment
        IERC20(asset).approve(debtVault, repayAmount);
        
        // Execute liquidation - receive collateral
        (uint256 maxRepay, uint256 maxYield) = IEVault(debtVault).checkLiquidation(
            address(this), violator, collateralVault
        );
        
        IEVault(debtVault).liquidate(violator, collateralVault, repayAmount, 0);
        
        // Swap collateral for debt asset (implement your swap logic)
        uint256 collateralReceived = IERC20(collateralVault).balanceOf(address(this));
        uint256 debtAssetReceived = swapCollateralForDebt(collateralVault, asset, collateralReceived);
        
        // Return borrowed amount to vault (keep profit)
        IERC20(asset).transfer(msg.sender, repayAmount);
    }
}
```

**TypeScript: Flash loan via EVC batch:**

```typescript
// Flash loans can also be done via EVC batch with borrow/repay
// This doesn't require implementing IFlashLoan interface

const batchItems: BatchItem[] = [
  // 1. Borrow from a vault where you have credit
  {
    onBehalfOfAccount: myAccount,
    targetContract: sourceVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'borrow',
      args: [borrowAmount, myAccount],
    }),
  },
  // 2. Do your operation (swap, liquidate, etc.)
  {
    onBehalfOfAccount: myAccount,
    targetContract: swapRouter,
    value: 0n,
    data: swapCalldata,
  },
  // 3. Repay the borrow
  {
    onBehalfOfAccount: myAccount,
    targetContract: sourceVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'repay',
      args: [borrowAmount, myAccount],
    }),
  },
];

// Health check at end ensures you're solvent
await evc.batch(batchItems);
```

**Pull Debt (take on another account's debt):**

```solidity
// pullDebt transfers debt FROM another account TO you
// Useful for debt consolidation, account migration, or helping friends

// Requirements:
// 1. You must be authenticated (or operator for the account)
// 2. You must have the vault as controller
// 3. You must have sufficient collateral
// 4. Cannot pull from yourself (use repay instead)

// Pull all debt from another account
uint256 theirDebt = IEVault(vault).debtOf(fromAccount);

IEVault(vault).pullDebt(
    type(uint256).max,  // or specific amount
    fromAccount         // whose debt to take
);

// After: your debt increased, their debt decreased
// The debt + interest is transferred, not principal
```

**Use Case: Account Migration:**

```typescript
// Move debt from old sub-account to new one

const oldSubAccount = getSubAccountAddress(mainAccount, 1);
const newSubAccount = getSubAccountAddress(mainAccount, 2);

const batchItems: BatchItem[] = [
  // Setup new account with collateral
  {
    onBehalfOfAccount: newSubAccount,
    targetContract: collateralVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'deposit',
      args: [collateralAmount, newSubAccount],
    }),
  },
  // Enable collateral on new account
  {
    onBehalfOfAccount: zeroAddress,
    targetContract: evcAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: evcABI,
      functionName: 'enableCollateral',
      args: [newSubAccount, collateralVault],
    }),
  },
  // Enable controller on new account
  {
    onBehalfOfAccount: zeroAddress,
    targetContract: evcAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: evcABI,
      functionName: 'enableController',
      args: [newSubAccount, debtVault],
    }),
  },
  // Pull debt from old account to new account
  {
    onBehalfOfAccount: newSubAccount,
    targetContract: debtVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'pullDebt',
      args: [MaxUint256, oldSubAccount],
    }),
  },
];

await evc.batch(batchItems);
// Old account now has 0 debt, can withdraw collateral
```

**Touch - Force Interest Accrual:**

```solidity
// touch() forces interest accrual without any other operation
// Useful for:
// - Updating interest accumulator before queries
// - Ensuring accurate debtOf/totalBorrows values
// - MEV protection in some scenarios

IEVault(vault).touch();

// Now all debt-related queries reflect latest interest
uint256 exactDebt = vault.debtOf(account);
```

**Borrowing View Functions:**

```solidity
// Total borrows across all borrowers (rounded up)
uint256 totalBorrows = vault.totalBorrows();

// Exact total borrows in internal precision
uint256 totalBorrowsExact = vault.totalBorrowsExact();

// Available cash in vault (not borrowed)
uint256 availableCash = vault.cash();

// Account debt (rounded up)
uint256 debt = vault.debtOf(account);

// Exact debt in internal precision
uint256 debtExact = vault.debtOfExact(account);

// Current interest rate (per second, scaled by 1e27)
uint256 rate = vault.interestRate();

// Interest accumulator (tracks compounded interest)
uint256 accumulator = vault.interestAccumulator();

// DToken address (synthetic debt token for tracking)
address dToken = vault.dToken();
```

**TypeScript: Complete view function example:**

```typescript
const vault = getContract({
  address: vaultAddress,
  abi: evaultABI,
  client: publicClient
});

// Vault state
const totalBorrows = await vault.read.totalBorrows();
const cash = await vault.read.cash();
const totalAssets = await vault.read.totalAssets();

// Utilization = totalBorrows / (totalBorrows + cash)
const utilization = totalBorrows * 10000n / (totalBorrows + cash);

// Interest rate (convert from per-second to APY)
const ratePerSecond = await vault.read.interestRate();
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;
const RAY = 10n ** 27n;
// Approximate APY: (1 + rate)^seconds - 1
const borrowAPY = (ratePerSecond * SECONDS_PER_YEAR * 100n) / RAY;

console.log(`Total Borrows: ${formatUnits(totalBorrows, 18)}`);
console.log(`Cash: ${formatUnits(cash, 18)}`);
console.log(`Utilization: ${utilization / 100n}%`);
console.log(`Borrow APY: ~${borrowAPY}%`);

// Account debt
const myDebt = await vault.read.debtOf([myAccount]);
const myDebtExact = await vault.read.debtOfExact([myAccount]);
console.log(`My Debt: ${formatUnits(myDebt, 18)}`);
```

Reference: [EVault Borrowing Module](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Borrowing.sol)
