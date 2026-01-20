# Euler Finance Agent Skill

**Version 1.0.0**  
Euler Labs  
January 2026

> **Note:**  
> This document is for agents and LLMs to follow when interacting with,  
> building on, or integrating Euler Finance protocol. It covers vault operations,  
> EVC batching, risk management, oracles, EulerEarn, and EulerSwap.

---

## Abstract

Comprehensive guide for interacting with Euler Finance V2 protocol. Covers vault operations (deposit, borrow, repay), EVC orchestration (batching, sub-accounts, operators), risk management (health factors, liquidation), oracle integration (adapters, routing), EulerEarn yield aggregation, and EulerSwap AMM integration. Designed for AI agents and developers building on Euler.

---

## Table of Contents

1. [Vault Operations](#1-vault-operations) — **CRITICAL**
   - 1.1 [Borrow Assets from a Vault](#11-borrow-assets-from-a-vault)
   - 1.2 [Create a New Vault/Market](#12-create-a-new-vaultmarket)
   - 1.3 [Deposit Assets into a Vault](#13-deposit-assets-into-a-vault)
   - 1.4 [Get Vault APY and Interest Rates](#14-get-vault-apy-and-interest-rates)
   - 1.5 [Repay Borrowed Debt](#15-repay-borrowed-debt)
2. [EVC Operations](#2-evc-operations) — **CRITICAL**
   - 2.1 [Batch Multiple Operations Atomically](#21-batch-multiple-operations-atomically)
   - 2.2 [Delegate Control via Operators](#22-delegate-control-via-operators)
   - 2.3 [Enable Vault as Collateral](#23-enable-vault-as-collateral)
   - 2.4 [Use Sub-Accounts for Isolated Positions](#24-use-sub-accounts-for-isolated-positions)
3. [Risk Management](#3-risk-management) — **HIGH**
   - 3.1 [Check Account Health Factor](#31-check-account-health-factor)
   - 3.2 [How Liquidation Works on Euler](#32-how-liquidation-works-on-euler)
   - 3.3 [Monitor Position Health](#33-monitor-position-health)
   - 3.4 [Understanding Risk Curators and Vault Governance](#34-understanding-risk-curators-and-vault-governance)
4. [Oracle Integration](#4-oracle-integration) — **HIGH**
   - 4.1 [Configure EulerRouter for Price Resolution](#41-configure-eulerrouter-for-price-resolution)
   - 4.2 [Deploy an Oracle Adapter](#42-deploy-an-oracle-adapter)
   - 4.3 [Get Asset Prices from Oracles](#43-get-asset-prices-from-oracles)
5. [Architecture](#5-architecture) — **HIGH**
   - 5.1 [Understanding Euler Market Design](#51-understanding-euler-market-design)
   - 5.2 [Understanding Vault Types (Core, Edge, Escrow)](#52-understanding-vault-types-core-edge-escrow)
6. [Interest Rate Models](#6-interest-rate-models) — **HIGH**
   - 6.1 [Interest Rate Model Types and Configuration](#61-interest-rate-model-types-and-configuration)
7. [Advanced Features](#7-advanced-features) — **MEDIUM**
   - 7.1 [EUL Reward Token Distribution](#71-eul-reward-token-distribution)
   - 7.2 [Fee Flow Controller Mechanics](#72-fee-flow-controller-mechanics)
   - 7.3 [Flash Loans and Debt Transfer](#73-flash-loans-and-debt-transfer)
   - 7.4 [Vault Hooks and Use Cases](#74-vault-hooks-and-use-cases)
8. [Security](#8-security) — **CRITICAL**
   - 8.1 [Security and Audits](#81-security-and-audits)
9. [Developer Tools](#9-developer-tools) — **MEDIUM**
   - 9.1 [Contract Addresses and ABIs](#91-contract-addresses-and-abis)
   - 9.2 [Creator Tools and Deployment Resources](#92-creator-tools-and-deployment-resources)
   - 9.3 [Data Querying with Subgraphs](#93-data-querying-with-subgraphs)
   - 9.4 [Lens Contracts for Data Queries](#94-lens-contracts-for-data-queries)
10. [EulerEarn](#10-eulerearn) — **MEDIUM**
   - 10.1 [Create an EulerEarn Vault](#101-create-an-eulerearn-vault)
   - 10.2 [Manage EulerEarn Strategies](#102-manage-eulerearn-strategies)
11. [EulerSwap](#11-eulerswap) — **MEDIUM**
   - 11.1 [Check EulerSwap Liquidity Limits](#111-check-eulerswap-liquidity-limits)
   - 11.2 [Execute Swaps on EulerSwap](#112-execute-swaps-on-eulerswap)
   - 11.3 [Get Swap Quotes from EulerSwap](#113-get-swap-quotes-from-eulerswap)

---

## 1. Vault Operations

**Impact: CRITICAL**

Core lending and borrowing operations on Euler V2 vaults. These are the fundamental building blocks for interacting with Euler - depositing collateral, borrowing assets, and managing positions. Understanding these operations is essential for any integration.

### 1.1 Borrow Assets from a Vault

**Impact: CRITICAL (Core lending operation with liquidation risk)**

Borrowing on Euler requires enabling the vault as your controller and having sufficient collateral enabled. This creates a debt position that accrues interest.

**Incorrect: borrowing without enabling controller**

```solidity
// This will revert - vault is not enabled as controller
IEVault(vault).borrow(amount, receiver);
// Error: E_ControllerDisabled
```

**Incorrect: borrowing without collateral**

```solidity
// Enable controller but forget collateral
IEVC(evc).enableController(account, vault);
IEVault(vault).borrow(amount, receiver);
// Error: E_AccountLiquidity - no collateral to back the loan
```

**Correct: full borrow flow**

```solidity
// Step 1: Deposit collateral into a collateral vault
IERC20(collateralAsset).approve(collateralVault, collateralAmount);
IEVault(collateralVault).deposit(collateralAmount, account);

// Step 2: Enable the collateral vault for your account
IEVC(evc).enableCollateral(account, collateralVault);

// Step 3: Enable the borrow vault as your controller
// This gives the vault authority to check your account status
IEVC(evc).enableController(account, borrowVault);

// Step 4: Borrow assets
// - amount: how much to borrow
// - receiver: who receives the borrowed assets
uint256 borrowed = IEVault(borrowVault).borrow(amount, receiver);
```

**Correct: batched borrow via EVC for atomicity**

```typescript
// Batch all operations for gas efficiency and atomicity
const batchItems = [
  // Deposit collateral
  {
    targetContract: collateralVault,
    onBehalfOfAccount: account,
    value: 0n,
    data: encodeFunctionData({
      abi: eVaultABI,
      functionName: 'deposit',
      args: [collateralAmount, account],
    }),
  },
  // Enable collateral (EVC call - onBehalfOfAccount must be address(0))
  {
    targetContract: evcAddress,
    onBehalfOfAccount: '0x0000000000000000000000000000000000000000',
    value: 0n,
    data: encodeFunctionData({
      abi: evcABI,
      functionName: 'enableCollateral',
      args: [account, collateralVault],
    }),
  },
  // Enable controller (EVC call - onBehalfOfAccount must be address(0))
  {
    targetContract: evcAddress,
    onBehalfOfAccount: '0x0000000000000000000000000000000000000000',
    value: 0n,
    data: encodeFunctionData({
      abi: evcABI,
      functionName: 'enableController',
      args: [account, borrowVault],
    }),
  },
  // Borrow
  {
    targetContract: borrowVault,
    onBehalfOfAccount: account,
    value: 0n,
    data: encodeFunctionData({
      abi: eVaultABI,
      functionName: 'borrow',
      args: [borrowAmount, account],
    }),
  },
];

await evc.batch(batchItems);
```

Important considerations:

- You can only have ONE controller per account (for single-liability)

- Use sub-accounts to hold multiple different borrows

- Monitor your health factor to avoid liquidation

- The borrow LTV must be satisfied at all times

Reference: [https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#controller](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#controller)

### 1.2 Create a New Vault/Market

**Impact: HIGH (Deploy new lending markets for any asset)**

Creating a new Euler vault allows you to establish a lending market for any ERC-20 token. This requires deploying the vault via the factory and configuring its parameters.

**Incorrect: deploying vault without proper configuration**

```solidity
// Deploying without IRM or oracle makes vault unusable for borrowing
address vault = factory.createProxy(address(0), true, "");
// This vault cannot price collateral or calculate interest
```

**Correct: full vault deployment flow**

```solidity
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";
import {IEVault} from "evk/EVault/IEVault.sol";

// Step 1: Deploy or select an Interest Rate Model
address irm = irmFactory.deploy(
    baseRate,    // e.g., 0 for 0% base rate
    slope1,      // e.g., 4e27 for 4% at kink
    slope2,      // e.g., 300e27 for 300% max
    kink         // e.g., 0.9e18 for 90% utilization
);

// Step 2: Deploy or configure an oracle
address oracle = eulerRouter; // EulerRouter configured for this asset

// Step 3: Prepare vault initialization data (tightly packed, 60 bytes)
// Format: 20 bytes asset + 20 bytes oracle + 20 bytes unitOfAccount
bytes memory initData = abi.encodePacked(
    asset,              // Underlying asset address (20 bytes)
    oracle,             // Price oracle address (20 bytes)
    unitOfAccount       // Unit of account (20 bytes, e.g., USD reference or address(0) for ETH)
);

// Step 4: Create the vault via factory
address vault = GenericFactory(factory).createProxy(
    address(0),  // No specific salt (use msg.sender + nonce)
    true,        // Upgradeable
    initData
);
```

**Correct: configuring vault after deployment**

```solidity
IEVault vault = IEVault(vaultAddress);

// Set interest rate model
vault.setInterestRateModel(irm);

// Configure LTV for accepted collaterals
// borrowLTV: max LTV for new borrows
// liquidationLTV: LTV at which liquidation can occur
vault.setLTV(
    collateralVault,     // Address of collateral vault
    0.75e4,              // 75% borrow LTV
    0.85e4,              // 85% liquidation LTV
    0                    // No ramp (instant)
);

// Set caps to limit exposure (uint16 AmountCap encoding)
// AmountCap format: 10 bits mantissa + 6 bits exponent
// Use encodeAmountCap helper or pre-calculated values
// Example: supplyCap=7059 ≈ 11e18, borrowCap=38418 ≈ 5e18
vault.setCaps(
    7059,   // ~11e18 supply cap (see AmountCap encoding docs)
    38418   // ~5e18 borrow cap
);
// NOTE: Use VaultLens to decode caps to human-readable amounts

// Set interest fee (protocol revenue)
vault.setInterestFee(0.1e4); // 10% of interest goes to fee receiver

// Set fee receiver
vault.setFeeReceiver(feeRecipient);

// Configure hooks if needed
vault.setHookConfig(hookTarget, hookedOps);
```

**Correct: using EVK deployment scripts**

```bash
# Clone euler-vault-kit repository
git clone https://github.com/euler-xyz/euler-vault-kit
cd euler-vault-kit

# Configure deployment parameters in script
# See script/deploy.s.sol for full example

# Deploy with Foundry
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

Important considerations:

- Always test on testnet first

- Configure appropriate LTV ratios for risk management

- Set reasonable caps to limit protocol exposure

- Consider using a perspective contract for vault verification

- Governance admin can be set to address(0) for immutability

Reference: [https://docs.euler.finance/euler-vault-kit-white-paper/](https://docs.euler.finance/euler-vault-kit-white-paper/)

### 1.3 Deposit Assets into a Vault

**Impact: CRITICAL (Fundamental operation for supplying liquidity)**

Depositing assets into an Euler vault is the first step to earning yield or using assets as collateral. Euler vaults are ERC-4626 compliant.

**Incorrect: forgetting to approve tokens first**

```solidity
// This will revert - vault cannot pull tokens without approval
IEVault(vault).deposit(amount, receiver);
```

**Correct: approve then deposit**

```solidity
// Step 1: Approve the vault to spend your tokens
IERC20(asset).approve(vault, amount);

// Step 2: Deposit assets and receive vault shares
// - amount: the amount of underlying assets to deposit
// - receiver: address that will receive the vault shares
uint256 shares = IEVault(vault).deposit(amount, receiver);
```

**Correct: using Permit2 for gasless approvals**

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

**Correct: using mint instead of deposit**

```solidity
// Enable this vault as collateral for your account
IEVC(evc).enableCollateral(account, vault);
```

After depositing, you can enable the vault as collateral via EVC to borrow from other vaults:

Reference: [https://eips.ethereum.org/EIPS/eip-4626](https://eips.ethereum.org/EIPS/eip-4626)

### 1.4 Get Vault APY and Interest Rates

**Impact: HIGH (Essential for yield comparison and strategy decisions)**

Understanding APY is critical for comparing yield opportunities and making informed lending/borrowing decisions on Euler.

**Incorrect: reading raw interest rate without conversion**

```solidity
// The interestRate() returns the per-second interest rate (SPY)
// NOT the APY - this value will be extremely small and misleading
uint256 rate = IEVault(vault).interestRate();
// rate = 1000000000 (this is NOT 100% APY!)
```

**Correct: using VaultLens for complete APY data**

```typescript
import { VaultLens } from '@eulerxyz/evk-periphery';

// VaultLens provides pre-calculated APY values
const vaultInfo = await vaultLens.getVaultInfoDynamic(vaultAddress);

// Access the IRM info which contains calculated APYs
const irmInfo = vaultInfo.irmInfo;
const interestRateInfo = irmInfo.interestRateInfo[0];

// borrowAPY - what borrowers pay (already converted to annual %)
const borrowAPY = interestRateInfo.borrowAPY;

// supplyAPY - what suppliers earn (accounts for utilization and fees)
const supplyAPY = interestRateInfo.supplyAPY;

// borrowSPY - raw per-second rate if you need it
const borrowSPY = interestRateInfo.borrowSPY;

console.log(`Supply APY: ${supplyAPY / 1e25}%`);
console.log(`Borrow APY: ${borrowAPY / 1e25}%`);
```

**Correct: calculating APY from SPY manually in Solidity**

```typescript
// UtilsLens provides a simpler API for just APY data
const [borrowAPY, supplyAPY] = await utilsLens.read.getAPYs([vaultAddress]);
console.log(`Borrow APY: ${formatUnits(borrowAPY, 25)}%`);
console.log(`Supply APY: ${formatUnits(supplyAPY, 25)}%`);
```

The VaultLens approach is preferred as it handles edge cases and provides additional useful data like collateral LTV info, oracle prices, and IRM parameters.

**Alternative: Using UtilsLens for quick APY queries**

See also: [Lens Contracts for Data Queries](tools-lens) for comprehensive Lens documentation.

Reference: [https://github.com/euler-xyz/evk-periphery/blob/master/src/Lens/VaultLens.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/Lens/VaultLens.sol)

### 1.5 Repay Borrowed Debt

**Impact: HIGH (Essential for managing debt and avoiding liquidation)**

Repaying debt reduces your borrow balance and improves your health factor. Interest accrues continuously, so the debt amount increases over time.

**Incorrect: repaying exact original borrow amount**

```solidity
// Interest has accrued - this won't fully repay the debt
uint256 originalBorrow = 1000e18;
IERC20(asset).approve(vault, originalBorrow);
IEVault(vault).repay(originalBorrow, account);
// Still has dust debt remaining!
```

**Correct: query current debt and repay with buffer**

```solidity
// Get the current debt amount (includes accrued interest)
uint256 currentDebt = IEVault(vault).debtOf(account);

// Add a small buffer for interest accruing during tx
uint256 repayAmount = currentDebt + (currentDebt / 1000); // 0.1% buffer

IERC20(asset).approve(vault, repayAmount);

// Repay - excess will be refunded or you can use type(uint256).max
uint256 actualRepaid = IEVault(vault).repay(currentDebt, account);
```

**Correct: repay max to clear all debt**

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

**Correct: partial repay to improve health factor**

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

**Correct: repay with vault shares instead of underlying**

```typescript
const vault = getContract({
  address: vaultAddress,
  abi: evaultABI,
  client: walletClient
});

// Check balances
const myDebt = await vault.read.debtOf([account]);
const myShares = await vault.read.balanceOf([account]);
const shareValue = await vault.read.convertToAssets([myShares]);

console.log(`Debt: ${myDebt}, Shares: ${myShares}, Share Value: ${shareValue}`);

// Repay with all shares (up to debt amount)
const [sharesBurned, assetsRepaid] = await vault.write.repayWithShares([
  MaxUint256,  // use all available shares
  account
]);

console.log(`Burned ${sharesBurned} shares, repaid ${assetsRepaid} debt`);
```

**TypeScript: repayWithShares example:**

After fully repaying:

- The controller can be released, freeing your collateral

- You can withdraw collateral or use it elsewhere

- Sub-account becomes available for new positions

Reference: [https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Borrowing.sol](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Borrowing.sol)

---

## 2. EVC Operations

**Impact: CRITICAL**

The Ethereum Vault Connector (EVC) is the central orchestration layer for Euler V2. It enables batching multiple operations atomically, managing sub-accounts for isolated positions, delegating control via operators, and handling collateral/controller relationships. Mastering EVC operations is key to efficient Euler integration.

### 2.1 Batch Multiple Operations Atomically

**Impact: CRITICAL (Gas savings and atomic execution of complex DeFi operations)**

The EVC's batch function allows executing multiple operations in a single transaction. This provides atomicity (all succeed or all fail), gas savings, and deferred liquidity checks.

**Incorrect: separate transactions for each operation**

```solidity
// Multiple transactions = higher gas, not atomic, potential for partial failure
IEVC(evc).enableCollateral(account, collateralVault);  // Tx 1
IEVault(collateralVault).deposit(amount, account);      // Tx 2
IEVC(evc).enableController(account, borrowVault);       // Tx 3
IEVault(borrowVault).borrow(borrowAmount, account);     // Tx 4
// If Tx 4 fails, Tx 1-3 already executed!
```

**Correct: batch all operations atomically**

```solidity
IEVC.BatchItem[] memory items = new IEVC.BatchItem[](4);

// Item 1: Enable collateral
// NOTE: When target is EVC itself, onBehalfOfAccount MUST be address(0)
items[0] = IEVC.BatchItem({
    onBehalfOfAccount: address(0),
    targetContract: address(evc),
    value: 0,
    data: abi.encodeCall(IEVC.enableCollateral, (account, collateralVault))
});

// Item 2: Deposit collateral (vault call - use account)
items[1] = IEVC.BatchItem({
    onBehalfOfAccount: account,
    targetContract: collateralVault,
    value: 0,
    data: abi.encodeCall(IEVault.deposit, (amount, account))
});

// Item 3: Enable controller (EVC call - use address(0))
items[2] = IEVC.BatchItem({
    onBehalfOfAccount: address(0),
    targetContract: address(evc),
    value: 0,
    data: abi.encodeCall(IEVC.enableController, (account, borrowVault))
});

// Item 4: Borrow (vault call - use account)
items[3] = IEVC.BatchItem({
    onBehalfOfAccount: account,
    targetContract: borrowVault,
    value: 0,
    data: abi.encodeCall(IEVault.borrow, (borrowAmount, account))
});

// Execute all atomically - liquidity check deferred to end
IEVC(evc).batch(items);
```

**Correct: TypeScript with viem**

```typescript
import { encodeFunctionData } from 'viem';

const batchItems = [
  // EVC calls: onBehalfOfAccount must be address(0)
  {
    onBehalfOfAccount: '0x0000000000000000000000000000000000000000',
    targetContract: evcAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: evcABI,
      functionName: 'enableCollateral',
      args: [account, collateralVault],
    }),
  },
  // Vault calls: use the actual account
  {
    onBehalfOfAccount: account,
    targetContract: collateralVault,
    value: 0n,
    data: encodeFunctionData({
      abi: eVaultABI,
      functionName: 'deposit',
      args: [depositAmount, account],
    }),
  },
  // ... more items
];

const tx = await evc.write.batch([batchItems]);
```

**Correct: flash loan style - borrow before collateral**

```solidity
// Deferred checks allow temporarily invalid states!
// Borrow first, deposit collateral second - works in batch
IEVC.BatchItem[] memory items = new IEVC.BatchItem[](4);

items[0] = IEVC.BatchItem({
    onBehalfOfAccount: address(0),  // EVC call - must be address(0)
    targetContract: address(evc),
    value: 0,
    data: abi.encodeCall(IEVC.enableController, (account, borrowVault))
});

items[1] = IEVC.BatchItem({
    onBehalfOfAccount: account,
    targetContract: borrowVault,
    value: 0,
    data: abi.encodeCall(IEVault.borrow, (borrowAmount, account))
});

// Use borrowed funds to get collateral (e.g., swap)
items[2] = IEVC.BatchItem({
    onBehalfOfAccount: account,
    targetContract: swapRouter,
    value: 0,
    data: abi.encodeCall(ISwapRouter.swap, (/* params */))
});

// Deposit collateral - now account is healthy
items[3] = IEVC.BatchItem({
    onBehalfOfAccount: account,
    targetContract: collateralVault,
    value: 0,
    data: abi.encodeCall(IEVault.deposit, (collateralAmount, account))
});

// Liquidity check happens AFTER all operations
IEVC(evc).batch(items);
```

Key benefits:

- Atomic execution - all or nothing

- Gas savings - single transaction overhead

- Deferred liquidity checks - temporary violations allowed

- Can interact with any contract, not just vaults

Reference: [https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#batch](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#batch)

### 2.2 Delegate Control via Operators

**Impact: HIGH (Enable automated strategies and position management)**

Operators are addresses authorized to act on behalf of an account. They enable automated strategies like stop-loss, take-profit, and position management without giving up custody.

**Incorrect: giving full wallet access**

```solidity
// NEVER share private keys or use unlimited approvals for automation
// This is insecure and gives full control
IERC20(token).approve(automationContract, type(uint256).max);
```

**Correct: install operator for specific account**

```solidity
// Operators can only act on the specific account they're authorized for
// Account owner can revoke at any time

// Install an operator for a specific sub-account
IEVC(evc).setAccountOperator(
    account,           // The account to delegate
    operatorAddress,   // Address that can act on behalf
    true               // true = authorize, false = revoke
);

// The operator can now execute actions on this account via EVC
```

**Correct: operator executing on behalf of account**

```solidity
// Operator contract example - stop-loss implementation
contract StopLossOperator {
    IEVC public immutable evc;
    
    function executeStopLoss(
        address account,
        address vault,
        uint256 repayAmount
    ) external {
        // Verify conditions are met (price dropped below threshold)
        require(shouldTriggerStopLoss(account), "Conditions not met");
        
        // Execute via EVC on behalf of the account
        IEVC.BatchItem[] memory items = new IEVC.BatchItem[](2);
        
        // Repay debt
        items[0] = IEVC.BatchItem({
            onBehalfOfAccount: account,
            targetContract: vault,
            value: 0,
            data: abi.encodeCall(IEVault.repay, (repayAmount, account))
        });
        
        // Withdraw collateral to safety
        items[1] = IEVC.BatchItem({
            onBehalfOfAccount: account,
            targetContract: collateralVault,
            value: 0,
            data: abi.encodeCall(IEVault.withdraw, (
                type(uint256).max, 
                account, 
                account
            ))
        });
        
        evc.batch(items);
    }
}
```

**Correct: TypeScript operator management**

```typescript
// Install operator
await evc.write.setAccountOperator([
  userAccount,
  operatorContractAddress,
  true, // authorize
]);

// Check if operator is authorized
const isOperator = await evc.read.isAccountOperatorAuthorized([
  userAccount,
  operatorContractAddress,
]);

// Revoke operator access
await evc.write.setAccountOperator([
  userAccount,
  operatorContractAddress,
  false, // revoke
]);
```

**Correct: operator with limited scope via hooks**

```solidity
// Combine with hooks for fine-grained control
contract LimitedOperator {
    // Only allow specific operations
    mapping(bytes4 => bool) public allowedSelectors;
    
    function execute(
        address account,
        address target,
        bytes calldata data
    ) external {
        bytes4 selector = bytes4(data[:4]);
        require(allowedSelectors[selector], "Operation not allowed");
        
        IEVC.BatchItem[] memory items = new IEVC.BatchItem[](1);
        items[0] = IEVC.BatchItem({
            onBehalfOfAccount: account,
            targetContract: target,
            value: 0,
            data: data
        });
        
        IEVC(evc).batch(items);
    }
}
```

Key differences from controllers:

- Operators can be revoked by account owner at any time

- Controllers cannot be revoked (only by controller itself)

- Operators cannot change collateral/controller sets

- Operators are for delegation, controllers are for borrowing

Reference: [https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#operators](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#operators)

### 2.3 Enable Vault as Collateral

**Impact: CRITICAL (Required before collateral can back borrows)**

Before vault deposits can be used as collateral for borrowing, you must explicitly enable the vault in your account's collateral set via EVC.

**Incorrect: borrowing without enabling collateral**

```solidity
// Deposit into vault
IEVault(collateralVault).deposit(amount, account);

// Try to borrow - fails because collateral not recognized
IEVC(evc).enableController(account, borrowVault);
IEVault(borrowVault).borrow(borrowAmount, account);
// Error: E_AccountLiquidity - no recognized collateral
```

**Correct: enable collateral before borrowing**

```solidity
// Step 1: Deposit into the collateral vault
IERC20(asset).approve(collateralVault, amount);
IEVault(collateralVault).deposit(amount, account);

// Step 2: Enable this vault as collateral for your account
// This adds the vault to your account's collateral set
IEVC(evc).enableCollateral(account, collateralVault);

// Step 3: Now you can borrow against this collateral
IEVC(evc).enableController(account, borrowVault);
IEVault(borrowVault).borrow(borrowAmount, account);
```

**Correct: batch enable multiple collaterals**

```solidity
IEVC.BatchItem[] memory items = new IEVC.BatchItem[](3);

// Enable WETH vault as collateral
// NOTE: When target is EVC itself, onBehalfOfAccount MUST be address(0)
items[0] = IEVC.BatchItem({
    onBehalfOfAccount: address(0),
    targetContract: address(evc),
    value: 0,
    data: abi.encodeCall(IEVC.enableCollateral, (account, wethVault))
});

// Enable WBTC vault as collateral
items[1] = IEVC.BatchItem({
    onBehalfOfAccount: address(0),
    targetContract: address(evc),
    value: 0,
    data: abi.encodeCall(IEVC.enableCollateral, (account, wbtcVault))
});

// Enable stETH vault as collateral
items[2] = IEVC.BatchItem({
    onBehalfOfAccount: address(0),
    targetContract: address(evc),
    value: 0,
    data: abi.encodeCall(IEVC.enableCollateral, (account, stethVault))
});

IEVC(evc).batch(items);
```

**Correct: checking and disabling collateral**

```solidity
// Check if vault is enabled as collateral
bool isCollateral = IEVC(evc).isCollateralEnabled(account, vault);

// Get all enabled collaterals for an account
address[] memory collaterals = IEVC(evc).getCollaterals(account);

// Disable collateral (only works if not needed for health)
// WARNING: Will fail if removing would make account unhealthy
IEVC(evc).disableCollateral(account, vault);
```

**Correct: reorder collaterals for gas optimization**

```solidity
// Controllers loop through collaterals in order
// Put highest-value collateral first for gas savings
// reorderCollaterals swaps two collateral positions

// Swap collateral at index 0 with collateral at index 2
IEVC(evc).reorderCollaterals(account, 0, 2);

// This moves the third collateral to first position
// Multiple calls can be made to achieve desired ordering
```

Important considerations:

- Collateral vault must be accepted by the borrow vault's LTV configuration

- Each vault can have different LTV ratios (borrow LTV vs liquidation LTV)

- Disabling collateral fails if it would make account unhealthy

- Maximum 10 collaterals per account (SET_MAX_ELEMENTS)

- Collateral order affects gas costs during health checks

Reference: [https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#collateral-validity](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#collateral-validity)

### 2.4 Use Sub-Accounts for Isolated Positions

**Impact: HIGH (Manage multiple isolated positions from one wallet)**

Sub-accounts allow a single Ethereum address to manage up to 256 isolated positions. Each sub-account can have different collateral/debt combinations with separate liquidation risk.

**Incorrect: using same account for multiple borrows**

```solidity
// ERROR: Account can only have ONE controller at a time
IEVC(evc).enableController(account, borrowVaultA);
IEVC(evc).enableController(account, borrowVaultB);
// Second call fails or overwrites first!
```

**Correct: use sub-accounts for different borrows**

```solidity
// Sub-accounts share first 19 bytes, differ in last byte (0-255)
// Account: 0x1234...5678XX where XX is the sub-account index

// Get sub-account addresses
address subAccount0 = account;  // Original address is sub-account 0
address subAccount1 = address(uint160(account) ^ 1);  // XOR with index
address subAccount2 = address(uint160(account) ^ 2);

// Each sub-account can have its own controller
IEVC(evc).enableController(subAccount0, borrowVaultA);  // ETH borrow
IEVC(evc).enableController(subAccount1, borrowVaultB);  // USDC borrow
IEVC(evc).enableController(subAccount2, borrowVaultC);  // DAI borrow

// Each position is isolated - liquidation of one doesn't affect others
```

**Correct: helper function for sub-account calculation**

```solidity
/// @notice Get sub-account address for a given index
/// @param owner The primary account address
/// @param subAccountId The sub-account index (0-255)
/// @return The sub-account address
function getSubAccount(address owner, uint8 subAccountId) 
    public 
    pure 
    returns (address) 
{
    return address(uint160(owner) ^ uint160(subAccountId));
}

// Usage
address ethPosition = getSubAccount(msg.sender, 0);
address usdcPosition = getSubAccount(msg.sender, 1);
address daiPosition = getSubAccount(msg.sender, 2);
```

**Correct: rebalancing between sub-accounts in a batch**

```typescript
// Move collateral between sub-accounts without needing approvals
const subAccount0 = getSubAccount(account, 0);
const subAccount1 = getSubAccount(account, 1);

const batchItems = [
  // Withdraw from sub-account 0
  {
    onBehalfOfAccount: subAccount0,
    targetContract: collateralVault,
    value: 0n,
    data: encodeFunctionData({
      abi: eVaultABI,
      functionName: 'withdraw',
      args: [amount, subAccount1, subAccount0], // receiver is subAccount1
    }),
  },
  // Deposit to sub-account 1 happens automatically via receiver
];

// Owner can operate on behalf of any sub-account
await evc.write.batch([batchItems]);
```

**Correct: checking sub-account ownership**

```solidity
// EVC tracks owner for sub-account groups
function getAccountOwner(address account) external view returns (address) {
    // Returns the primary address (sub-account 0) that controls this sub-account
    return IEVC(evc).getAccountOwner(account);
}

// Verify ownership
address owner = IEVC(evc).getAccountOwner(subAccount5);
require(owner == expectedOwner, "Not owned by expected address");
```

Key points:

- Sub-accounts share 19 bytes, differ in last byte (0-255)

- Owner can operate on all 256 sub-accounts without approval

- Each sub-account can have ONE controller (single liability)

- Collateral can be shared or isolated per sub-account

- Use different sub-accounts for different risk strategies

Reference: [https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#sub-accounts](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#sub-accounts)

---

## 3. Risk Management

**Impact: HIGH**

Monitoring and managing position health to avoid liquidation. Includes health factor calculations, understanding liquidation mechanics, risk curator roles, and implementing protection strategies. Critical for maintaining safe positions.

### 3.1 Check Account Health Factor

**Impact: HIGH (Critical for avoiding liquidation)**

Health factor determines how close an account is to liquidation. A health factor below 1.0 means the account can be liquidated. Monitoring health is essential for safe position management.

**Incorrect: only checking debt amount**

```solidity
// Debt amount alone doesn't indicate liquidation risk
uint256 debt = IEVault(vault).debtOf(account);
// This tells you nothing about health - need to compare against collateral value
```

**Correct: using AccountLens for health check**

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

**Correct: on-chain health check via vault**

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

**Correct: calculating health factor manually**

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

**Correct: setting up health monitoring**

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

**Correct: using vault's accountLiquidity directly**

```solidity
// accountLiquidity returns risk-adjusted values directly from the vault
// This is what the vault uses internally for health checks

// For borrow LTV (determines if you can borrow more)
(uint256 collateralValue, uint256 liabilityValue) = IEVault(controller).accountLiquidity(
    account,
    false  // liquidation = false uses borrow LTV
);

// Health = collateralValue / liabilityValue
// If collateralValue >= liabilityValue, account is healthy for borrowing
bool canBorrow = collateralValue >= liabilityValue;

// For liquidation LTV (determines if account can be liquidated)
(uint256 collateralValueLiq, uint256 liabilityValueLiq) = IEVault(controller).accountLiquidity(
    account,
    true   // liquidation = true uses liquidation LTV
);

// If collateralValueLiq < liabilityValueLiq, account is liquidatable
bool isLiquidatable = collateralValueLiq < liabilityValueLiq;
```

**Correct: detailed breakdown with accountLiquidityFull**

```typescript
const vault = getContract({
  address: controllerAddress,
  abi: evaultABI,
  client: publicClient
});

// Get liquidity with borrow LTV
const [collateralBorrow, liabilityBorrow] = await vault.read.accountLiquidity([
  account,
  false  // borrow LTV
]);

// Get liquidity with liquidation LTV
const [collateralLiq, liabilityLiq] = await vault.read.accountLiquidity([
  account,
  true   // liquidation LTV
]);

// Calculate both health factors
const borrowHealth = liabilityBorrow > 0n 
  ? (collateralBorrow * 10n ** 18n) / liabilityBorrow 
  : MaxUint256;

const liquidationHealth = liabilityLiq > 0n
  ? (collateralLiq * 10n ** 18n) / liabilityLiq
  : MaxUint256;

console.log(`Borrow Health: ${formatUnits(borrowHealth, 18)}`);
console.log(`Liquidation Health: ${formatUnits(liquidationHealth, 18)}`);

// Full breakdown
const [collaterals, values, liability] = await vault.read.accountLiquidityFull([
  account,
  true
]);

for (let i = 0; i < collaterals.length; i++) {
  console.log(`${collaterals[i]}: ${formatUnits(values[i], 18)} value`);
}
```

**TypeScript: Using accountLiquidity:**

**Correct: disabling controller after full repayment**

```typescript
const batchItems: BatchItem[] = [
  // Repay all debt
  {
    onBehalfOfAccount: account,
    targetContract: controllerVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'repay',
      args: [MaxUint256, account],
    }),
  },
  // Disable controller
  {
    onBehalfOfAccount: account,
    targetContract: controllerVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'disableController',
      args: [],
    }),
  },
  // Disable collateral (optional - via EVC)
  {
    onBehalfOfAccount: zeroAddress,
    targetContract: evcAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: evcABI,
      functionName: 'disableCollateral',
      args: [account, collateralVault],
    }),
  },
  // Withdraw collateral
  {
    onBehalfOfAccount: account,
    targetContract: collateralVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'withdraw',
      args: [MaxUint256, account, account],
    }),
  },
];

await evc.batch(batchItems);
```

**TypeScript: Full repay and disable flow:**

**Understanding checkAccountStatus and checkVaultStatus:**

```solidity
// These are EVC callback functions - NOT meant to be called directly by users
// The EVC calls them during deferred checks at the end of batches

// checkAccountStatus: Called by EVC to verify account health
// - Reverts if account is unhealthy (collateral < liability)
// - Returns magic value on success
bytes4 magic = IEVault(controller).checkAccountStatus(account, collaterals);
// magic == IEVCVault.checkAccountStatus.selector

// checkVaultStatus: Called by EVC to verify vault caps
// - Checks supply and borrow caps aren't exceeded
// - Reverts with E_SupplyCapExceeded or E_BorrowCapExceeded
// - Also triggers interest rate recalculation
bytes4 magic = IEVault(vault).checkVaultStatus();
```

Key concepts:

- Health > 1.0 = safe from liquidation

- Borrow LTV: max health when taking new borrows

- Liquidation LTV: health at which liquidation can occur

- Always maintain buffer above 1.0 for price volatility

- `accountLiquidity(account, false)` = borrow LTV values

- `accountLiquidity(account, true)` = liquidation LTV values

- Call `disableController()` after full repayment to release position

See also: [Lens Contracts](tools-lens) - AccountLens provides `getAccountLiquidityInfo()` and `getTimeToLiquidation()` for comprehensive health monitoring.

Reference: [https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/RiskManager.sol](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/RiskManager.sol)

### 3.2 How Liquidation Works on Euler

**Impact: HIGH (Understanding liquidation mechanics, math, and protection)**

Liquidation protects the protocol by allowing anyone to repay an unhealthy account's debt in exchange for their collateral at a discount. The discount is dynamically calculated based on how unhealthy the position is.

**Liquidation Math: from Liquidation.sol**

```solidity
// ═══════════════════════════════════════════════════════════
// DISCOUNT CALCULATION
// ═══════════════════════════════════════════════════════════

// Health score (discountFactor) = risk-adjusted collateral / liability
// discountFactor = 1.0 means healthy, < 1.0 means liquidatable
uint256 discountFactor = collateralAdjustedValue * 1e18 / liabilityValue;

// Discount = 1 - discountFactor (i.e., 1 - health score)
// Example: health = 0.85 → discount = 15%

// Cap discount at maxLiquidationDiscount (set by governor)
uint256 minDiscountFactor = 1e18 - (1e18 * maxLiquidationDiscount / 1e4);
if (discountFactor < minDiscountFactor) {
    discountFactor = minDiscountFactor;  // Cap the discount
}

// ═══════════════════════════════════════════════════════════
// MAX REPAY AND YIELD CALCULATION
// ═══════════════════════════════════════════════════════════

// Start with full liability as max repay
uint256 maxRepayValue = liabilityValue;

// Yield value = repay value / discountFactor (more yield at lower health)
uint256 maxYieldValue = maxRepayValue * 1e18 / discountFactor;

// Limit by available collateral
uint256 collateralValue = oracle.getQuote(collateralBalance, collateral, unitOfAccount);
if (collateralValue < maxYieldValue) {
    // Can only seize what's available
    maxRepayValue = collateralValue * discountFactor / 1e18;
    maxYieldValue = collateralValue;
}

// Convert values to asset amounts
repay = maxRepayValue * liability / liabilityValue;
yieldBalance = maxYieldValue * collateralBalance / collateralValue;
```

**Practical Example:**

```typescript
Position:
- Debt: 1000 USDC (value: $1000)
- Collateral: 1 ETH (value: $1200)
- Liquidation LTV: 90%
- Max Liquidation Discount: 15%

Health Score:
- Adjusted Collateral = $1200 * 90% = $1080
- Health = $1080 / $1000 = 1.08 → HEALTHY (>1.0)

After ETH drops to $1050:
- Adjusted Collateral = $1050 * 90% = $945
- Health = $945 / $1000 = 0.945 → LIQUIDATABLE (<1.0)
- Discount Factor = 0.945
- Discount = 1 - 0.945 = 5.5%

Liquidation:
- Repay: $1000 of debt
- Yield: $1000 / 0.945 = $1058 worth of ETH
- Liquidator profit: $58 (5.5% discount)
```

**Correct: checking liquidation profitability**

```solidity
import {IEVault} from "evk/EVault/IEVault.sol";

// checkLiquidation returns (0, 0) if account is healthy
(uint256 maxRepay, uint256 maxYield) = IEVault(vault).checkLiquidation(
    liquidator,   // who will receive collateral
    violator,     // unhealthy account
    collateral    // which collateral to seize
);

if (maxRepay == 0) {
    // Account is healthy or no liquidation available
    return;
}

// Calculate profit
// Repay is in debt asset terms, yield is in collateral terms
uint256 repayValueUsd = maxRepay * debtPriceUsd / 1e18;
uint256 yieldValueUsd = maxYield * collateralPriceUsd / 1e18;
uint256 grossProfit = yieldValueUsd - repayValueUsd;

// Account for gas, slippage, swap fees
uint256 netProfit = grossProfit - estimatedCosts;
require(netProfit > 0, "Not profitable");
```

**Correct: executing liquidation**

```solidity
// liquidate(violator, collateral, repayAssets, minYieldBalance)
// - violator: the unhealthy account
// - collateral: which collateral vault to seize from
// - repayAssets: how much debt to repay (use type(uint256).max for all)
// - minYieldBalance: minimum collateral to receive (slippage protection)

// Must have debt tokens approved
IERC20(debtAsset).approve(vault, repayAmount);

// Execute - this transfers debt from violator to liquidator,
// and seizes collateral from violator to liquidator
IEVault(vault).liquidate(
    violator,
    collateral,
    repayAmount,
    minYieldBalance  // revert if yield < this
);
```

**Liquidation Constraints: from source**

```solidity
// These checks happen inside calculateLiquidation():

// 1. Cannot self-liquidate
require(violator != liquidator, "E_SelfLiquidation");

// 2. Collateral must have LTV configured (recognized)
require(isRecognizedCollateral(collateral), "E_BadCollateral");

// 3. Vault must be violator's controller
validateController(violator);

// 4. Violator must have enabled this collateral
require(isCollateralEnabled(violator, collateral), "E_CollateralDisabled");

// 5. No deferred status checks (prevents batch manipulation)
require(!isAccountStatusCheckDeferred(violator), "E_ViolatorLiquidityDeferred");

// 6. Must wait for cool-off period after last status check
require(!isInLiquidationCoolOff(violator), "E_LiquidationCoolOff");

// Cool-off check:
bool inCoolOff = block.timestamp < lastStatusCheckTimestamp + liquidationCoolOffTime;
```

**Debt Socialization: bad debt handling**

```solidity
// Debt socialization occurs when:
// 1. Liability value >= MIN_SOCIALIZATION_LIABILITY_VALUE (1e6 in unit of account)
// 2. CFG_DONT_SOCIALIZE_DEBT flag is NOT set
// 3. Remaining debt after liquidation (liability > repay)
// 4. Violator has no more collateral

// When triggered:
// - Remaining debt is written off
// - Loss is spread across all depositors (share value decreases)
// - Emit DebtSocialized(violator, remainingDebt)

// This protects liquidators from unprofitable liquidations
// when collateral value < debt value
```

**Worthless Collateral Edge Case:**

```typescript
import { getContract, parseUnits, formatUnits } from 'viem';

async function checkAndLiquidate(
  vault: Address,
  violator: Address,
  collateral: Address
) {
  const vaultContract = getContract({
    address: vault,
    abi: evaultABI,
    client: walletClient
  });

  // Check liquidation opportunity
  const [maxRepay, maxYield] = await vaultContract.read.checkLiquidation([
    liquidatorAddress,
    violator,
    collateral
  ]);

  if (maxRepay === 0n) {
    console.log('Account is healthy');
    return;
  }

  // Get prices for profit calculation
  const debtAsset = await vaultContract.read.asset();
  const debtDecimals = await vaultContract.read.decimals();
  
  // Calculate value (simplified - use oracle in production)
  const repayValue = Number(formatUnits(maxRepay, Number(debtDecimals)));
  const yieldValue = /* calculate from yield amount and price */;
  const discount = (yieldValue - repayValue) / repayValue * 100;

  console.log(`Liquidation available:`);
  console.log(`  Repay: ${repayValue} (debt asset)`);
  console.log(`  Yield: ${yieldValue} (collateral)`);
  console.log(`  Discount: ${discount.toFixed(2)}%`);

  // Approve and execute
  const debtToken = getContract({
    address: debtAsset,
    abi: erc20ABI,
    client: walletClient
  });
  
  await debtToken.write.approve([vault, maxRepay]);
  
  // Set minYield slightly below maxYield for slippage tolerance
  const minYield = maxYield * 99n / 100n;  // 1% slippage
  
  const tx = await vaultContract.write.liquidate([
    violator,
    collateral,
    maxRepay,
    minYield
  ]);

  console.log(`Liquidation executed: ${tx}`);
}
```

**TypeScript: Complete liquidation bot example:**

**Flash Loan Liquidation: capital-efficient**

```typescript
// Use EVC batch to atomically:
// 1. Borrow debt asset (using another vault)
// 2. Execute liquidation
// 3. Swap seized collateral for debt asset
// 4. Repay borrowed amount
// 5. Keep profit

const batchItems: BatchItem[] = [
  // Borrow debt tokens from a vault where you have collateral
  {
    onBehalfOfAccount: liquidator,
    targetContract: flashVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'borrow',
      args: [repayAmount, liquidator],
    }),
  },
  // Execute liquidation
  {
    onBehalfOfAccount: liquidator,
    targetContract: debtVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'liquidate',
      args: [violator, collateralVault, repayAmount, minYield],
    }),
  },
  // Swap collateral to debt asset (via DEX)
  {
    onBehalfOfAccount: liquidator,
    targetContract: swapRouter,
    value: 0n,
    data: swapCalldata,
  },
  // Repay flash loan
  {
    onBehalfOfAccount: liquidator,
    targetContract: flashVault,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'repay',
      args: [repayAmount, liquidator],
    }),
  },
];

await evc.batch(batchItems);
// Health check runs at end - reverts if still unhealthy
```

**Key Parameters:**

| Parameter | Getter | Description |

|-----------|--------|-------------|

| maxLiquidationDiscount | `maxLiquidationDiscount()` | Max discount (e.g., 0.15e4 = 15%) |

| liquidationCoolOffTime | `liquidationCoolOffTime()` | Seconds after status check before liquidatable |

| liquidationLTV | `LTVLiquidation(collateral)` | LTV threshold for liquidation |

Reference: [https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Liquidation.sol](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Liquidation.sol)

### 3.3 Monitor Position Health

**Impact: HIGH (Continuous monitoring prevents unexpected liquidation)**

Continuous position monitoring is essential for DeFi risk management. Price movements can quickly change health factors, and timely responses can prevent liquidation losses.

**Incorrect: checking health only at deposit/borrow time**

```solidity
// Health at borrow time doesn't protect you later
uint256 healthAtBorrow = calculateHealth(account);
require(healthAtBorrow > 1.2e18, "Insufficient health");
IEVault(vault).borrow(amount, account);
// Days later, prices move and account gets liquidated!
```

**Correct: comprehensive position monitoring**

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

**Correct: automated monitoring with alerts**

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

**Correct: on-chain monitoring with keeper**

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

Reference: [https://docs.euler.finance/creator-tools/liquidation-bot/](https://docs.euler.finance/creator-tools/liquidation-bot/)

### 3.4 Understanding Risk Curators and Vault Governance

**Impact: HIGH (Essential for vault governance and risk management)**

Risk Curators (governors) are trusted entities responsible for ongoing vault configuration and risk management in Euler V2. They have full control over vault parameters through governance functions.

- [Governance.sol Source](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Governance.sol)

- [CapRiskSteward.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/Governor/CapRiskSteward.sol)

**Incorrect: assuming anyone can configure vaults**

```solidity
// WRONG: Only governor can modify vault config
IEVault vault = IEVault(vaultAddress);
vault.setLTV(collateral, 8000, 9000, 0);  // Will revert with E_Unauthorized!
vault.setCaps(100, 50);                    // Will revert with E_Unauthorized!
// Note: setCaps takes uint16 AmountCap encoded values, not raw asset amounts
```

**Complete list of governance functions:**

```solidity
import {IEVault} from "evk/EVault/IEVault.sol";

IEVault vault = IEVault(vaultAddress);

// ═══════════════════════════════════════════════════════════
// GOVERNANCE TRANSFER
// ═══════════════════════════════════════════════════════════

// Transfer governance to new address (or address(0) to renounce)
vault.setGovernorAdmin(newGovernor);

// Set fee receiver (receives governor's share of interest fees)
// If set to address(0), governor forfeits fees to protocol
vault.setFeeReceiver(newFeeReceiver);

// ═══════════════════════════════════════════════════════════
// LTV CONFIGURATION
// ═══════════════════════════════════════════════════════════

// Configure LTV for a collateral asset
// borrowLTV: max LTV for new borrows (in 1e4 scale, e.g., 0.85e4 = 85%)
// liquidationLTV: LTV at which liquidation is possible (must be >= borrowLTV)
// rampDuration: if lowering LTV, seconds to ramp down (prevents instant liquidations)
vault.setLTV(
    collateralVault,    // address of collateral vault
    0.85e4,             // 85% borrow LTV
    0.90e4,             // 90% liquidation LTV  
    0                   // ramp duration (0 for immediate, or seconds to ramp)
);

// IMPORTANT: When lowering liquidation LTV, use rampDuration to give users
// time to adjust positions. Setting rampDuration > 0 when RAISING LTV will revert.

// To disable a collateral, set LTV to 0 (with optional ramp):
vault.setLTV(collateralVault, 0, 0, 7 days); // 7-day ramp to 0

// ═══════════════════════════════════════════════════════════
// CAPS
// ═══════════════════════════════════════════════════════════

// Set supply and borrow caps (in AmountCap format - raw uint16)
// Use AmountCap library to encode/decode
// 0 = unlimited, otherwise encoded value
vault.setCaps(
    supplyCap,   // uint16 encoded supply cap
    borrowCap    // uint16 encoded borrow cap
);

// ═══════════════════════════════════════════════════════════
// INTEREST RATE MODEL
// ═══════════════════════════════════════════════════════════

// Set new interest rate model contract
vault.setInterestRateModel(newIRMAddress);

// Set interest fee (portion of interest that goes to fees)
// Range: 0 to 1e4 (100%)
// Guaranteed range (no protocol approval needed): 0.1e4 to 1e4 (10% to 100%)
// Outside this range requires protocolConfig approval
vault.setInterestFee(0.1e4);  // 10% interest fee

// ═══════════════════════════════════════════════════════════
// LIQUIDATION PARAMETERS
// ═══════════════════════════════════════════════════════════

// Set maximum liquidation discount
// In 1e4 scale (e.g., 0.15e4 = 15% max discount)
// Cannot be exactly 1e4 (would cause division by zero)
vault.setMaxLiquidationDiscount(0.15e4);  // 15% max discount

// Set liquidation cool-off time (seconds)
// Time that must pass after successful account status check before liquidation
vault.setLiquidationCoolOffTime(0);  // 0 = no cool-off

// ═══════════════════════════════════════════════════════════
// HOOKS AND FLAGS
// ═══════════════════════════════════════════════════════════

// Configure hook target and which operations are hooked
// hookedOps is a bitfield - see Constants.sol for operation flags
vault.setHookConfig(
    hookTargetAddress,  // contract implementing IHookTarget
    hookedOps           // bitfield of operations to hook
);

// Set configuration flags (see Constants.sol)
vault.setConfigFlags(configFlags);

// ═══════════════════════════════════════════════════════════
// FEE CONVERSION (not governorOnly - anyone can call)
// ═══════════════════════════════════════════════════════════

// Convert accumulated fees to shares for governor and protocol
// Can be called by anyone
vault.convertFees();
```

All functions below require `governorOnly` modifier (caller must be `governorAdmin`):

**Reading governance state:**

```typescript
import { getContract, parseUnits } from 'viem';

const vault = getContract({
  address: vaultAddress,
  abi: evaultABI,
  client: walletClient,  // Must be governor
});

// Check current state
const governor = await vault.read.governorAdmin();
console.log(`Governor: ${governor}`);

// Configure LTV for a new collateral
await vault.write.setLTV([
  collateralVaultAddress,
  8500n,   // 85% borrow LTV (0.85e4)
  9000n,   // 90% liquidation LTV (0.90e4)
  0n       // No ramp
]);

// Set caps
await vault.write.setCaps([
  supplyCap,  // uint16 AmountCap encoded
  borrowCap   // uint16 AmountCap encoded
]);

// Set interest fee (10%)
await vault.write.setInterestFee([1000n]);  // 0.1e4

// Set max liquidation discount (15%)
await vault.write.setMaxLiquidationDiscount([1500n]);  // 0.15e4

// Set new IRM
await vault.write.setInterestRateModel([newIRMAddress]);

// Read all collaterals and their LTVs
const ltvList = await vault.read.LTVList();
for (const collateral of ltvList) {
  const [borrowLTV, liqLTV, initLTV, targetTs, rampDur] = 
    await vault.read.LTVFull([collateral]);
  console.log(`${collateral}: borrow=${borrowLTV/100}%, liq=${liqLTV/100}%`);
}
```

**TypeScript: Complete governance example:**

**Important constraints from Governance.sol:**

```solidity
// Protocol fee share cannot exceed 50%
uint16 constant MAX_PROTOCOL_FEE_SHARE = 0.5e4;

// Interest fee guaranteed range (no approval needed)
uint16 constant GUARANTEED_INTEREST_FEE_MIN = 0.1e4;  // 10%
uint16 constant GUARANTEED_INTEREST_FEE_MAX = 1e4;    // 100%

// LTV constraints:
// - borrowLTV must be <= liquidationLTV
// - Cannot self-collateralize (collateral != vault address)
// - rampDuration > 0 only valid when LOWERING LTV
// - maxLiquidationDiscount cannot equal exactly 1e4 (100%)
```

**Risk Steward pattern for limited governance:**

```solidity
import {CapRiskSteward} from "evk-periphery/Governor/CapRiskSteward.sol";

// CapRiskSteward allows limited cap adjustments without full governance
CapRiskSteward steward = new CapRiskSteward(
    evc,
    admin,
    3 days,      // riskSteerCooldown: min time between adjustments
    0.1e18       // riskSteerCapLimit: max 10% change per adjustment
);

steward.setRiskSteerVault(vaultAddress, true);
steward.setSupplyCap(vaultAddress, newSupplyCap);
steward.setBorrowCap(vaultAddress, newBorrowCap);
```

When integrating with Euler, prefer vaults verified in `GovernedPerspective` as they have been reviewed by Euler. However, risk assessment must be done by the Curator and assessed by individual users for their risk appetite.

---

## 4. Oracle Integration

**Impact: HIGH**

Price oracle adapters and configuration for Euler vaults. Covers deploying oracle adapters (Chainlink, Pyth, Uniswap TWAP), configuring EulerRouter for price resolution, and querying prices for assets.

### 4.1 Configure EulerRouter for Price Resolution

**Impact: HIGH (Central oracle routing for vault pricing)**

EulerRouter is the central price resolution contract that routes price queries to appropriate oracle adapters. It supports direct pricing and ERC-4626 vault share pricing via `convertToAssets`.

**Incorrect: hardcoding oracle in vault**

```solidity
// Don't hardcode individual oracles in vaults
// This makes upgrades and fixes impossible
IEVault(vault).setOracle(specificOracleAdapter);
// If oracle has issues, vault is stuck
```

**Correct: deploy and configure EulerRouter**

```solidity
import {EulerRouter} from "euler-price-oracle/EulerRouter.sol";
import {EulerRouterFactory} from "evk-periphery/EulerRouterFactory/EulerRouterFactory.sol";

// Deploy router via factory (requires EVC address)
address router = EulerRouterFactory(factory).deploy(evc, governor);

// Configure pricing for asset pairs
EulerRouter eulerRouter = EulerRouter(router);

// Set direct oracle for ETH/USD
// Note: Assets are lexicographically sorted internally
eulerRouter.govSetConfig(
    weth,                    // Base asset
    usd,                     // Quote asset  
    chainlinkEthUsdOracle    // Oracle adapter address
);

// Set direct oracle for BTC/USD
eulerRouter.govSetConfig(
    wbtc,
    usd,
    chainlinkBtcUsdOracle
);
```

**Correct: understanding resolution - NO automatic cross-pricing**

```solidity
// IMPORTANT: EulerRouter does NOT automatically chain oracles!
// For TOKEN/USD pricing, you must EITHER:
// 1. Configure a direct TOKEN/USD oracle, OR
// 2. Use a CrossAdapter that handles the cross-pricing internally

// Resolution order in resolveOracle():
// 1. base == quote? Return inAmount (same asset)
// 2. Direct oracle configured for base/quote? Use it
// 3. Base is a resolved ERC4626 vault? Convert via convertToAssets, recurse
// 4. Fallback oracle set? Use it
// 5. Revert with PriceOracle_NotSupported

// Example: If you need TOKEN/USD via TOKEN/ETH and ETH/USD,
// use a CrossAdapter, not multiple govSetConfig calls
import {CrossAdapter} from "euler-price-oracle/adapter/CrossAdapter.sol";

// Deploy cross adapter that chains TOKEN/ETH -> ETH/USD
address crossAdapter = new CrossAdapter(
    tokenEthOracle,   // First oracle: TOKEN/ETH
    ethUsdOracle,     // Second oracle: ETH/USD
    weth              // Cross asset (intermediate)
);

// Configure router with the cross adapter
eulerRouter.govSetConfig(tokenAddress, usd, crossAdapter);
```

**Correct: ERC-4626 vault share pricing**

```solidity
// For pricing vault shares in terms of underlying
// Router uses convertToAssets() for automatic share->asset conversion

// Configure underlying asset pricing first
eulerRouter.govSetConfig(
    underlyingAsset,
    usd,
    underlyingOracle
);

// Enable vault share resolution
// Router will call vault.convertToAssets() and recurse
eulerRouter.govSetResolvedVault(
    vaultAddress,
    true  // Enable automatic share->asset conversion
);

// To disable later:
eulerRouter.govSetResolvedVault(vaultAddress, false);

// Now queries for vault shares work:
// vaultShares -> convertToAssets -> underlying -> USD
uint256 shareValueUsd = eulerRouter.getQuote(1e18, vaultAddress, usd);

// IMPORTANT: Verify vault's convertToAssets is secure before configuring!
// Per ERC4626 spec, convert* ignores liquidity, fees, slippage
// The reported price may not be realizable through redeem/withdraw
```

**Correct: TypeScript router configuration**

```typescript
import { encodeFunctionData, getContract } from 'viem';

const eulerRouter = getContract({
  address: routerAddress,
  abi: eulerRouterABI,
  client: walletClient
});

// Configure oracle for asset pair
// Note: gov functions require being called by governor via EVC context
await eulerRouter.write.govSetConfig([
  wethAddress,        // base
  usdAddress,         // quote  
  chainlinkOracle     // oracle adapter
]);

// Configure resolved vault for share pricing
await eulerRouter.write.govSetResolvedVault([
  vaultAddress,
  true  // set = true to enable, false to disable
]);

// Query prices
const quote = await eulerRouter.read.getQuote([
  parseEther('1'),    // inAmount
  wethAddress,        // base
  usdAddress          // quote
]);

// Get bid/ask quotes
const [bid, ask] = await eulerRouter.read.getQuotes([
  parseEther('1'),
  wethAddress,
  usdAddress
]);

// Check configured oracle for a pair
const oracle = await eulerRouter.read.getConfiguredOracle([
  wethAddress,
  usdAddress
]);
```

**Correct: fallback configuration**

```solidity
// Set fallback oracle for pairs without direct config
// Called when no direct oracle AND base is not a resolved vault
eulerRouter.govSetFallbackOracle(fallbackOracleAddress);

// To remove fallback:
eulerRouter.govSetFallbackOracle(address(0));

// Resolution order:
// 1. base == quote → return inAmount
// 2. Direct config for base/quote → use configured oracle
// 3. Base is resolved vault → convertToAssets, recurse with asset
// 4. Fallback oracle exists → use fallback
// 5. No fallback → revert PriceOracle_NotSupported(base, quote)
```

**Correct: querying existing configuration**

```solidity
// Get configured oracle for a pair
// Returns address(0) if not configured
address oracle = eulerRouter.getConfiguredOracle(base, quote);

// Check if vault is configured for resolved pricing
address asset = eulerRouter.resolvedVaults(vaultAddress);
bool isResolved = asset != address(0);

// Get current fallback oracle
address fallback = eulerRouter.fallbackOracle();

// Simulate full resolution path
(uint256 resolvedAmount, address resolvedBase, address resolvedQuote, address resolvedOracle) = 
    eulerRouter.resolveOracle(inAmount, base, quote);
```

**Important considerations:**

```solidity
// Gov functions have onlyEVCAccountOwner and onlyGovernor modifiers
// Must be called by governor, typically via EVC context

// Finalize router to make immutable (optional)
eulerRouter.transferGovernance(address(0));
// WARNING: No more configuration changes possible after this!

// For upgradeable setups, use a timelock or multisig as governor
// This allows fixing oracle issues without vault redeployment

// Assets are lexicographically sorted internally in the mapping
// govSetConfig(A, B, oracle) and govSetConfig(B, A, oracle) 
// configure the same pair - order doesn't matter for callers
```

Reference: [https://github.com/euler-xyz/euler-price-oracle/blob/master/src/EulerRouter.sol](https://github.com/euler-xyz/euler-price-oracle/blob/master/src/EulerRouter.sol)

### 4.2 Deploy an Oracle Adapter

**Impact: HIGH (Required for vault pricing and risk management)**

Oracle adapters translate external price feeds into Euler's `IPriceOracle` interface. Each adapter is immutable and connects to a single price source.

**Incorrect: using Chainlink directly without adapter**

```solidity
// Chainlink returns (roundId, answer, startedAt, updatedAt, answeredInRound)
// This raw interface is incompatible with Euler's IPriceOracle
(, int256 answer,,,) = AggregatorV3Interface(feed).latestRoundData();
// Also missing staleness checks, decimal handling, etc.
```

**Correct: deploy ChainlinkOracle adapter**

```solidity
import {ChainlinkOracle} from "euler-price-oracle/adapter/chainlink/ChainlinkOracle.sol";

// Deploy adapter with configuration
ChainlinkOracle oracle = new ChainlinkOracle(
    base,           // Base token address (e.g., WETH)
    quote,          // Quote token address (e.g., USD reference)
    feed,           // Chainlink feed address
    maxStaleness    // Max age in seconds (e.g., 3600 for 1 hour)
);

// Adapter now implements IPriceOracle
// getQuote(inAmount, base, quote) returns outAmount
uint256 ethValueInUsd = oracle.getQuote(1e18, weth, usd);
```

**Correct: deploy PythOracle adapter**

```typescript
// TypeScript: Fetching Pyth price updates
async function getPythUpdateData(feedIds: string[]): Promise<string[]> {
  const response = await fetch(
    `https://hermes.pyth.network/api/latest_vaas?ids[]=${feedIds.join('&ids[]=')}`
  );
  const data = await response.json();
  return data.map((vaa: string) => `0x${vaa}`);
}

// Include price update in your transaction
const updateData = await getPythUpdateData([priceFeedId]);
const updateFee = await pythContract.read.getUpdateFee([updateData]);

// Option 1: Separate transaction
await pythContract.write.updatePriceFeeds(updateData, { value: updateFee });
await vault.write.deposit([amount, receiver]);

// Option 2: Batch via EVC (recommended)
const batchItems = [
  {
    targetContract: pythAddress,
    onBehalfOfAccount: zeroAddress,
    value: updateFee,
    data: encodeFunctionData({
      abi: pythABI,
      functionName: 'updatePriceFeeds',
      args: [updateData]
    })
  },
  {
    targetContract: vaultAddress,
    onBehalfOfAccount: account,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'deposit',
      args: [amount, receiver]
    })
  }
];
await evc.write.batch(batchItems, { value: updateFee });
```

**CRITICAL: Pyth Price Updates Required**

Pyth oracles are pull-based and **will revert if prices are stale**. You must update prices before any Euler operation that uses the oracle (deposits, borrows, liquidations, etc.):

For production, consider using MEV protection services that bundle price updates automatically.

**Correct: deploy UniswapV3 TWAP oracle**

```solidity
import {UniswapV3Oracle} from "euler-price-oracle/adapter/uniswap/UniswapV3Oracle.sol";

// TWAP oracle for manipulation resistance
UniswapV3Oracle oracle = new UniswapV3Oracle(
    tokenA,        // First token in pair
    tokenB,        // Second token in pair
    fee,           // Pool fee tier (500, 3000, or 10000)
    twapWindow,    // TWAP window in seconds (e.g., 1800 for 30 min)
    uniswapFactory // Uniswap V3 factory address
);

// TWAP provides manipulation-resistant pricing
// Longer window = more resistant but slower to update
```

**Correct: deploy rate provider oracle for LSTs**

```solidity
import {LidoOracle} from "euler-price-oracle/adapter/lido/LidoOracle.sol";
import {RateProviderOracle} from "euler-price-oracle/adapter/rate/RateProviderOracle.sol";

// For wstETH/stETH (built-in Lido support)
LidoOracle wstethOracle = new LidoOracle(wsteth, steth);

// For other rate providers (e.g., Balancer)
RateProviderOracle rateOracle = new RateProviderOracle(
    baseToken,         // e.g., rETH
    quoteToken,        // e.g., ETH
    rateProvider       // Balancer rate provider address
);
```

**Correct: deploy ChronicleOracle adapter**

```solidity
import {ChronicleOracle} from "euler-price-oracle/adapter/chronicle/ChronicleOracle.sol";

// Chronicle is MakerDAO's oracle system
ChronicleOracle oracle = new ChronicleOracle(
    base,           // Base token address
    quote,          // Quote token address
    feed,           // Chronicle feed address (IChronicle)
    maxStaleness    // Max age in seconds
);

// Note: Chronicle feeds require whitelisting (kiss)
// The adapter address must be whitelisted on the Chronicle feed
// Contact Chronicle team for production whitelisting
```

**Correct: deploy RedStoneOracle adapter**

```solidity
import {RedstoneCoreOracle} from "euler-price-oracle/adapter/redstone/RedstoneCoreOracle.sol";

// RedStone provides modular, gas-optimized oracle feeds
RedstoneCoreOracle oracle = new RedstoneCoreOracle(
    base,                    // Base token address
    quote,                   // Quote token address
    feedId,                  // RedStone feed ID (bytes32)
    feedDecimals,            // Feed decimal precision
    maxStaleness             // Max age in seconds
);

// RedStone requires signed price payloads in calldata
// Use RedStone SDK to wrap transactions with price data
```

**Correct: deploy FixedRateOracle for stablecoins**

```solidity
import {FixedRateOracle} from "euler-price-oracle/adapter/fixed/FixedRateOracle.sol";

// For stablecoins pegged 1:1 (e.g., USDC/USD, DAI/USD)
FixedRateOracle oracle = new FixedRateOracle(
    base,       // Base token (e.g., USDC)
    quote,      // Quote token (e.g., USD reference)
    rate        // Fixed rate in 18 decimals (1e18 for 1:1)
);

// Use for:
// - Stablecoin pairs (USDC/USDT at 1:1)
// - Wrapped tokens (WETH/ETH at 1:1)
// - Testing and development
```

**Correct: deploy CrossAdapter for chained pricing**

```solidity
import {CrossAdapter} from "euler-price-oracle/adapter/CrossAdapter.sol";

// CrossAdapter chains two oracles through an intermediate asset
// Example: TOKEN -> ETH -> USD (requires TOKEN/ETH and ETH/USD oracles)

CrossAdapter oracle = new CrossAdapter(
    oracleBaseCross,    // First oracle: TOKEN/ETH
    oracleCrossQuote,   // Second oracle: ETH/USD
    crossAsset          // Intermediate asset: ETH (WETH address)
);

// Price flow: TOKEN -> ETH (via oracleBaseCross) -> USD (via oracleCrossQuote)
// Useful for tokens that only have ETH pairs but vault needs USD pricing

// Example: Deploy cross adapter for LINK/USD via LINK/ETH and ETH/USD
CrossAdapter linkUsdOracle = new CrossAdapter(
    linkEthChainlinkOracle,   // LINK/ETH feed
    ethUsdChainlinkOracle,    // ETH/USD feed  
    weth                       // Cross through WETH
);
```

**Correct: deploy PendleOracle for yield-bearing tokens**

```typescript
// TypeScript: Check if Pendle market is ready for oracle
async function isPendleMarketReady(
  market: Address,
  twapWindow: number
): Promise<boolean> {
  const [increaseCardinalityRequired, , oldestObservationSatisfied] = 
    await publicClient.readContract({
      address: market,
      abi: pendleMarketABI,
      functionName: 'getOracleState',
      args: [market, twapWindow]
    });
  
  return !increaseCardinalityRequired && oldestObservationSatisfied;
}

// Initialize market if needed
async function initializePendleMarket(market: Address, cardinality: number) {
  await walletClient.writeContract({
    address: market,
    abi: pendleMarketABI,
    functionName: 'increaseObservationsCardinalityNext',
    args: [cardinality]
  });
  
  console.log(`Market initialized. Wait ${twapWindow} seconds before using oracle.`);
}
```

**IMPORTANT: Pendle Market Initialization Required**

Pendle markets must be initialized before the oracle can return prices:

**Oracle Adapter Selection Guide:**

| Use Case | Recommended Adapter | Configuration |

|----------|-------------------|---------------|

| Major pairs (ETH/USD, BTC/USD) | ChainlinkOracle | 1-4 hour staleness |

| DeFi tokens with liquidity | UniswapV3Oracle | 15-30 min TWAP |

| LSTs (wstETH, rETH, cbETH) | LidoOracle / RateProviderOracle | Exchange rate based |

| New/exotic tokens | PythOracle | Pull-based, requires updates |

| MakerDAO ecosystem | ChronicleOracle | Requires whitelisting |

| Gas-optimized feeds | RedStoneOracle | Calldata-based pricing |

| Stablecoins (USDC, USDT) | FixedRateOracle | 1:1 rate |

| Cross-currency pricing | CrossAdapter | Chain through intermediate |

| Pendle PT/LP tokens | PendleOracle | Market TWAP |

| Wrapped tokens (WETH/ETH) | FixedRateOracle | 1:1 rate |

**Verification after deployment:**

```solidity
// Verify adapter works correctly
uint256 quoteAmount = oracle.getQuote(1e18, base, quote);
console.log("1 base =", quoteAmount, "quote");

// Check both directions work
uint256 reverseQuote = oracle.getQuote(quoteAmount, quote, base);
// Should be approximately 1e18 (within precision)

// For bid/ask oracles
(uint256 bidOut, uint256 askOut) = oracle.getQuotes(1e18, base, quote);
console.log("Bid:", bidOut, "Ask:", askOut);
```

Reference: [https://github.com/euler-xyz/euler-price-oracle#oracle-adapters](https://github.com/euler-xyz/euler-price-oracle#oracle-adapters)

### 4.3 Get Asset Prices from Oracles

**Impact: HIGH (Essential for value calculations and risk assessment)**

Querying prices is fundamental for calculating position values, health factors, and making trading decisions. Euler oracles use a quote-based interface that returns amounts rather than unit prices.

**Incorrect: assuming unit price response**

```solidity
// Wrong: Oracles don't return "price per token"
uint256 price = oracle.getPrice(token);
uint256 value = tokenAmount * price;
// getPrice() doesn't exist in IPriceOracle!
```

**Correct: using getQuote for amount conversion**

```solidity
import {IPriceOracle} from "euler-price-oracle/interfaces/IPriceOracle.sol";

// IPriceOracle.getQuote: "How much quote do I get for inAmount of base?"
// This is like asking "How much USD is 1 ETH worth?"

// Get value of 1 ETH in USD
uint256 ethInUsd = IPriceOracle(oracle).getQuote(
    1e18,      // inAmount: 1 ETH (18 decimals)
    weth,      // base: the token you have
    usd        // quote: the token you want value in
);
// Returns: 2000e18 (if ETH = $2000)

// Get value of 0.5 BTC in ETH
uint256 btcInEth = IPriceOracle(oracle).getQuote(
    0.5e8,     // inAmount: 0.5 BTC (8 decimals)  
    wbtc,      // base: BTC
    weth       // quote: ETH
);
// Returns: 15e18 (if 0.5 BTC = 15 ETH)
```

**Correct: using OracleLens for comprehensive data**

```typescript
import { OracleLens } from '@eulerxyz/evk-periphery';

// OracleLens provides rich oracle information
const oracleInfo = await oracleLens.getOracleInfo(
  oracleAddress,
  [weth, wbtc, link],  // base tokens
  [usd, usd, usd]       // quote tokens
);

// Access individual prices
oracleInfo.prices.forEach((priceInfo, i) => {
  console.log(`${bases[i]}: ${priceInfo.quote} ${quotes[i]}`);
  console.log(`  Oracle: ${priceInfo.oracle}`);
  console.log(`  Success: ${priceInfo.success}`);
});
```

**Correct: bid/ask pricing for spreads**

```solidity
// getQuotes returns both bid and ask prices
// Useful for more accurate risk calculations
(uint256 bidOut, uint256 askOut) = IPriceOracle(oracle).getQuotes(
    1e18,
    weth,
    usd
);

// bidOut: What you'd get if SELLING 1 ETH (lower)
// askOut: What you'd pay to BUY 1 ETH (higher)
// Spread = askOut - bidOut

// For lending, use bid (selling collateral)
// For borrowing, use ask (buying debt)
uint256 collateralValue = (collateralAmount * bidOut) / 1e18;
uint256 debtValue = (debtAmount * askOut) / 1e18;
```

**Correct: handling oracle failures**

```typescript
async function safeGetQuote(
  oracle: Address,
  inAmount: bigint,
  base: Address,
  quote: Address
): Promise<{ success: boolean; value: bigint; error?: string }> {
  try {
    const value = await publicClient.readContract({
      address: oracle,
      abi: iPriceOracleABI,
      functionName: 'getQuote',
      args: [inAmount, base, quote],
    });
    
    return { success: true, value };
  } catch (error) {
    // Oracle might revert for various reasons:
    // - Stale price
    // - No liquidity (TWAP)
    // - Unsupported pair
    return { 
      success: false, 
      value: 0n,
      error: error.message 
    };
  }
}

// Usage with fallback
const result = await safeGetQuote(primaryOracle, amount, base, quote);
if (!result.success) {
  console.warn('Primary oracle failed, trying fallback');
  const fallback = await safeGetQuote(fallbackOracle, amount, base, quote);
  if (!fallback.success) {
    throw new Error('All oracles failed');
  }
  return fallback.value;
}
```

**Correct: calculating portfolio value**

```typescript
// Pyth prices are pull-based - must update before use
const updateData = await fetch(
  `https://hermes.pyth.network/api/latest_vaas?ids[]=${feedId}`
).then(r => r.json());

const updateFee = await pythContract.read.getUpdateFee([updateData]);
await pythContract.write.updatePriceFeeds(updateData, { value: updateFee });

// Now price query will work
const price = await oracle.read.getQuote([amount, base, quote]);
```

**Important: Pyth Oracle Price Updates**

If using Pyth oracles, prices must be updated before querying or the call will revert:

Key points:

- `getQuote` converts amounts, not returns unit prices

- Always handle potential oracle reverts gracefully

- Consider bid/ask spreads for accurate risk assessment

- Decimals are handled internally by adapters

- Cross-pricing works automatically through EulerRouter

- **Pyth oracles require price updates before any operation that uses them**

See also: [Lens Contracts](tools-lens) - OracleLens for oracle validation and checking stale pull oracles.

Reference: [https://github.com/euler-xyz/euler-price-oracle#iprice oracle](https://github.com/euler-xyz/euler-price-oracle#iprice oracle)

---

## 5. Architecture

**Impact: HIGH**

Core market design and vault architecture concepts. Understanding Euler's modular design - including vault types (Core, Edge, Escrow), market structure, and how components interact - is essential for building on Euler.

### 5.1 Understanding Euler Market Design

**Impact: HIGH (Fundamental knowledge for building on Euler V2)**

Euler V2 uses a modular "vault kit" architecture where each market is an independent ERC-4626 vault with its own configuration for oracle, interest rate model, and collateral relationships.

- [Euler Markets Documentation](https://docs.euler.finance/concepts/core/markets)

- [EVK Whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)

**Incorrect: assuming monolithic pool like Compound/Aave**

```solidity
// WRONG: There's no single "Euler pool" to interact with
// Each asset has its own vault(s) with independent configuration
address eulerPool = 0x...;
IPool(eulerPool).deposit(USDC, amount); // This doesn't exist!
```

**Correct: understanding independent vault architecture**

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

**Correct: understanding the EVC layer**

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

1. **Vaults are ERC-4626**: Standard deposit/withdraw interface plus borrowing extensions

2. **Oracles per vault**: Each vault has its own EulerRouter for price resolution

3. **Unit of Account**: Common price denomination (usually USD or ETH) for LTV calculations

4. **Collateral is vault shares**: When you deposit, you get vault shares that can be collateral

5. **Controller relationship**: The vault you borrow from is your "controller"

6. **LTV is vault-to-vault**: Each collateral-controller pair has specific LTV settings

**Market Design Patterns:**

```solidity
// Example: Simple isolated pair (Morpho-style)
// - WETH vault holds collateral in escrow only
// - USDC vault is the lending/borrowing vault
// - WETH vault has no borrowing enabled

// Example: Rehypothecation pair (Silo-style)  
// - WETH vault: accepts USDC as collateral, lends WETH
// - USDC vault: accepts WETH as collateral, lends USDC
// - Assets earn yield while backing loans

// Example: Cross-collateralised cluster (Aave-style)
// - WETH, WBTC, USDC, DAI vaults all interconnected
// - Each can lend and serve as collateral for others
// - Higher contagion risk if one vault defaults
```

Euler's modular architecture enables various market structures. Choose based on capital efficiency vs risk isolation tradeoffs:

| Design | Description | Similar To | Capital Efficiency | Risk Isolation |

|--------|-------------|------------|-------------------|----------------|

| Simple collateral-debt pairs | One collateral vault, one borrow vault | Morpho, FraxLend, Kashi | Low | High |

| Rehypothecation pairs | Both vaults lend and serve as collateral for each other | Silo, Fluid | Medium | Medium |

| Multiple collaterals | Many collateral vaults borrow from one lending vault | Compound | Medium-High | Medium |

| Cross-collateralised clusters | Multiple vaults all lend and collateralize each other | Aave | High | Low |

| Fully customisable | Any configuration, including vaults from existing markets | Unique to Euler | Variable | Variable |

**Creating Custom Markets:**

```solidity
// Vaults can accept collateral from ANY existing vault
// This enables composability with the broader Euler ecosystem

// Step 1: Deploy your vault
address myVault = EVaultFactory.createProxy(
    asset,
    false,  // not upgradeable
    ""      // no trailing data
);

// Step 2: Configure to accept existing vault shares as collateral
IEVault(myVault).setLTV(
    existingPopularVault,  // e.g., an established USDC vault
    0.85e4,                // 85% borrow LTV
    0.90e4,                // 90% liquidation LTV
    0                      // ramp duration
);

// Now users with deposits in existingPopularVault
// can borrow from your new vault without moving funds!
```

This modular design allows for permissionless market creation - anyone can deploy a vault with custom parameters while the EVC provides the security layer for cross-vault interactions.

### 5.2 Understanding Vault Types (Core, Edge, Escrow)

**Impact: HIGH (Critical for selecting appropriate vault type for your use case)**

Euler V2 has three distinct vault types, each serving different purposes and with different governance characteristics.

**Incorrect: treating all vaults the same**

```solidity
// WRONG: Not all vaults support borrowing or have the same features
IEVault vault = IEVault(anyVault);
vault.borrow(amount, receiver); // May revert for escrow vaults!
vault.setInterestRateModel(irm); // May not be configurable!
```

**Correct: understanding vault types**

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

Full-featured lending vaults with governance. Created via `GenericFactory` and verified by `GovernedPerspective`.

Pre-configured vaults with governance permanently renounced. Created via `EdgeFactory` for specific use cases.

Special vaults that only hold collateral - no borrowing, no IRM, no oracle. Created for pure collateral positions.

**Correct: using Perspectives to verify vault type**

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

Reference: [https://github.com/euler-xyz/evk-periphery/blob/master/src/Perspectives/deployed/EscrowedCollateralPerspective.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/Perspectives/deployed/EscrowedCollateralPerspective.sol), [https://github.com/euler-xyz/evk-periphery/blob/master/src/EdgeFactory/EdgeFactory.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/EdgeFactory/EdgeFactory.sol)

---

## 6. Interest Rate Models

**Impact: HIGH**

Available Interest Rate Models and their configuration. Euler supports multiple IRM types (Linear Kink, Adaptive Curve, Fixed Cyclical Binary, Base Premium) each suited for different use cases and risk profiles.

### 6.1 Interest Rate Model Types and Configuration

**Impact: HIGH (Critical for selecting and configuring appropriate interest rates)**

Euler V2 supports multiple Interest Rate Model (IRM) types, each suited for different market dynamics and risk profiles.

**Incorrect: using wrong IRM for use case**

```solidity
// WRONG: Using linear kink for a volatile asset that needs adaptive rates
// This can lead to under/over-utilization and poor capital efficiency
address irm = kinkIRMFactory.deploy(
    0,           // baseRate
    4e27,        // slope1 (4%)
    300e27,      // slope2 (300%)
    0.9e18       // kink (90%)
);
// Static rates don't adapt to market conditions!
```

**Correct: choosing appropriate IRM type**

```solidity
import {IRMBasePremium} from "evk-periphery/IRM/IRMBasePremium.sol";

// Admin can adjust rates without redeploying
IRMBasePremium irm = new IRMBasePremium(
    evc,
    admin,
    1e26,         // baseRate: 1% base
    5e26          // premiumRate: 5% premium (total 6%)
);

// Override premium for specific vaults
irm.setRateOverride(specialVault, true, 2e26); // 3% total for this vault
```

Traditional two-slope model. Rate increases linearly up to kink, then accelerates.

Self-adjusting model that targets specific utilization. Rate at target adjusts based on time spent above/below target.

Similar to kink IRM but with non-linear acceleration after kink using shape parameter.

Alternates between two fixed rates on a schedule. Useful for special mechanisms.

Admin-controlled fixed rate with per-vault overrides. Good for curated markets.

**Selecting the Right IRM:**

| Use Case | Recommended IRM | Reason |

|----------|-----------------|--------|

| Stable coins (USDC, DAI) | Linear Kink | Predictable behavior |

| Volatile assets (ETH, BTC) | Adaptive Curve | Self-adjusts to demand |

| New markets | Adaptive Curve | Finds optimal rate |

| Curated/governed | Base Premium | Direct control |

| Synthetic assets | Fixed Cyclical | Special mechanics |

Reference: [https://github.com/euler-xyz/evk-periphery/tree/master/src/IRM](https://github.com/euler-xyz/evk-periphery/tree/master/src/IRM)

---

## 7. Advanced Features

**Impact: MEDIUM**

Advanced protocol features including hooks for custom vault logic, fee flow for protocol revenue, and EUL reward token distribution. These enable sophisticated integrations and protocol mechanics.

### 7.1 EUL Reward Token Distribution

**Impact: MEDIUM (Understanding locked reward mechanics and vesting)**

RewardToken implements locked EUL distribution with a specific vesting schedule: 20% immediate unlock, 80% linear unlock over 6 months.

**Incorrect: expecting immediate full access to rewards**

```solidity
// WRONG: Reward tokens are locked and vest over time
IERC20(rewardToken).transfer(recipient, amount); // May revert or lose tokens!
```

**Correct: understanding locked reward mechanics**

```solidity
import {RewardToken} from "evk-periphery/ERC20/deployed/RewardToken.sol";

RewardToken reward = RewardToken(rewardTokenAddress);

// RewardToken wraps EUL with locking schedule
address underlying = address(reward.underlying()); // EUL token

// Unlock schedule (per the contract):
// - 20% unlocked immediately
// - Remaining 80% unlocks linearly over 180 days
// - Full unlock at 180 days from lock timestamp

// Check whitelist status
// WHITELIST_STATUS_NONE = 0: subject to lock schedule
// WHITELIST_STATUS_ADMIN = 1: can deposit/withdraw freely
// WHITELIST_STATUS_DISTRIBUTOR = 2: can transfer but not withdraw
uint256 status = reward.whitelistStatus(account);
```

**Correct: checking unlock amounts**

```solidity
// Get all lock entries for an account
(uint256[] memory lockTimestamps, uint256[] memory amounts) = 
    reward.getLockedAmounts(account);

// For each lock, check withdrawable amounts
for (uint i = 0; i < lockTimestamps.length; i++) {
    (uint256 accountAmount, uint256 remainderAmount) = 
        reward.getWithdrawAmountsByLockTimestamp(account, lockTimestamps[i]);
    
    // accountAmount: what account can withdraw now
    // remainderAmount: what goes to remainder receiver (DAO)
}
```

**Correct: withdrawing vested tokens**

```solidity
// Withdraw by specific lock timestamp
bool allowRemainderLoss = true; // Accept that unvested portion goes to DAO

reward.withdrawToByLockTimestamp(
    recipient,           // Where to send unlocked tokens
    lockTimestamp,       // Which lock to withdraw from
    allowRemainderLoss   // Must be true if any unvested
);

// Or withdraw from multiple locks at once
uint256[] memory timestamps = reward.getLockedAmountsLockTimestamps(account);
reward.withdrawToByLockTimestamps(
    recipient,
    timestamps,
    allowRemainderLoss
);
```

**Vesting Schedule Calculation:**

```typescript
import { getContract, formatEther } from 'viem';

const rewardToken = getContract({
  address: rewardTokenAddress,
  abi: rewardTokenABI,
  client: publicClient,
});

// Get user's locked amounts
const [lockTimestamps, amounts] = await rewardToken.read.getLockedAmounts([userAddress]);

let totalLocked = 0n;
let totalUnlockable = 0n;

for (let i = 0; i < lockTimestamps.length; i++) {
  const [accountAmount, remainderAmount] = 
    await rewardToken.read.getWithdrawAmountsByLockTimestamp([
      userAddress, 
      lockTimestamps[i]
    ]);
  
  totalLocked += amounts[i];
  totalUnlockable += accountAmount;
  
  const lockDate = new Date(Number(lockTimestamps[i]) * 1000);
  const fullUnlockDate = new Date(lockDate.getTime() + 180 * 24 * 60 * 60 * 1000);
  
  console.log(`Lock from ${lockDate.toISOString()}:`);
  console.log(`  Total: ${formatEther(amounts[i])} rEUL`);
  console.log(`  Unlockable: ${formatEther(accountAmount)} rEUL`);
  console.log(`  Full unlock: ${fullUnlockDate.toISOString()}`);
}

console.log(`\nTotal Locked: ${formatEther(totalLocked)} rEUL`);
console.log(`Total Unlockable: ${formatEther(totalUnlockable)} rEUL`);
```

**TypeScript: Tracking reward vesting:**

**Key Points:**

1. **Transfers restricted**: Non-whitelisted accounts cannot transfer to each other

2. **Remainder receiver**: Unvested tokens go to DAO treasury when claimed early

3. **Lock normalization**: Locks are grouped by day for gas efficiency

4. **Whitelist roles**: ADMIN can freely move tokens, DISTRIBUTOR can distribute but not withdraw

Reference: [https://github.com/euler-xyz/evk-periphery/blob/master/src/ERC20/deployed/RewardToken.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/ERC20/deployed/RewardToken.sol)

### 7.2 Fee Flow Controller Mechanics

**Impact: MEDIUM (Understanding protocol revenue and fee distribution)**

FeeFlowController implements continuous Dutch auctions to sell accumulated protocol fees. It converts vault shares (from interest fees) into payment tokens for the DAO.

**Incorrect: expecting direct fee claiming**

```solidity
// WRONG: Fees are not claimed directly
IEVault vault = IEVault(vaultAddress);
vault.claimFees(); // This doesn't exist!
```

**Correct: understanding fee flow architecture**

```solidity
import {IEVault} from "evk/EVault/IEVault.sol";

IEVault vault = IEVault(vaultAddress);

// Interest fees accumulate in the vault as shares
// interestFee is the percentage of interest that goes to protocol
uint16 interestFee = vault.interestFee(); // e.g., 0.1e4 = 10%

// Accumulated fees are in vault shares
uint256 accumulatedFees = vault.accumulatedFees();

// The fee receiver is typically the FeeFlowController
address feeReceiver = vault.feeReceiver();

// convertFees() converts accumulated shares to the fee receiver
// Anyone can call this to trigger the conversion
vault.convertFees();
```

**Correct: interacting with FeeFlowController**

```solidity
import {FeeFlowControllerEVK} from "evk-periphery/FeeFlow/FeeFlowControllerEVK.sol";

FeeFlowControllerEVK feeFlow = FeeFlowControllerEVK(feeFlowAddress);

// Get current auction state
FeeFlowControllerEVK.Slot0 memory slot0 = feeFlow.getSlot0();
uint256 currentPrice = feeFlow.getPrice();

// Auction parameters (immutable)
uint256 epochPeriod = feeFlow.epochPeriod();      // Auction duration
uint256 priceMultiplier = feeFlow.priceMultiplier(); // Price scaling
uint256 minInitPrice = feeFlow.minInitPrice();    // Minimum starting price

// Payment token (what buyer pays)
address paymentToken = address(feeFlow.paymentToken());

// Payment receiver (where payment goes)
address paymentReceiver = feeFlow.paymentReceiver();
```

**Correct: buying from the auction**

```solidity
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

// Dutch auction: price starts high and decreases over epoch
// Anyone can buy all accumulated assets at current price

// Step 1: Check current price
uint256 price = feeFlow.getPrice();

// Step 2: Check available assets
address[] memory assets = new address[](2);
assets[0] = vault1ShareToken;  // Vault 1 shares
assets[1] = vault2ShareToken;  // Vault 2 shares

// Step 3: Approve payment token
IERC20(paymentToken).approve(address(feeFlow), price);

// Step 4: Buy all assets
// This converts fees, transfers payment, and sends assets to buyer
feeFlow.buy(
    assets,           // Asset addresses to receive
    msg.sender,       // Receiver of assets
    slot0.epochId,    // Current epoch ID
    block.timestamp + 1 hours, // Deadline
    price * 101 / 100 // Max payment (with 1% slippage)
);
```

**Key FeeFlow Concepts:**

```typescript
import { getContract, formatEther } from 'viem';

const feeFlow = getContract({
  address: feeFlowAddress,
  abi: feeFlowABI,
  client: publicClient,
});

// Get auction state
const slot0 = await feeFlow.read.getSlot0();
const currentPrice = await feeFlow.read.getPrice();
const epochPeriod = await feeFlow.read.epochPeriod();

console.log(`Current Epoch: ${slot0.epochId}`);
console.log(`Current Price: ${formatEther(currentPrice)} tokens`);
console.log(`Epoch Start: ${new Date(Number(slot0.startTime) * 1000)}`);

// Calculate time remaining in epoch
const elapsed = BigInt(Math.floor(Date.now() / 1000)) - slot0.startTime;
const remaining = epochPeriod - elapsed;
console.log(`Time Remaining: ${remaining} seconds`);

// Price decreases linearly:
// price = initPrice - (initPrice * timePassed / epochPeriod)
// At epoch end, price = 0 (free!)
```

1. **Dutch Auction**: Price decreases linearly over epoch period

2. **Epoch Reset**: After each buy, new auction starts with adjusted initial price

3. **Price Adaptation**: Initial price adjusts based on settlement price (priceMultiplier)

4. **Atomic Operation**: Calls convertFees() on all vaults before transfer

5. **Optional Hook**: Can trigger additional operations on each buy

**TypeScript: Monitoring fee flow auctions:**

**Cross-Chain Fee Collection:**

FeeFlowControllerEVK supports bridging payment tokens to other chains via LayerZero OFT adapters, enabling unified treasury management across networks.

Reference: [https://github.com/euler-xyz/evk-periphery/blob/master/src/FeeFlow/FeeFlowControllerEVK.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/FeeFlow/FeeFlowControllerEVK.sol)

### 7.3 Flash Loans and Debt Transfer

**Impact: HIGH (Advanced borrowing operations for arbitrage and debt management)**

Euler vaults support flash loans (borrow and repay in same transaction) and debt transfer (pullDebt to take on another account's debt).

**Incorrect: not repaying flash loan in same transaction**

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

**Correct: flash loan with proper repayment**

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

**TypeScript: Flash loan via EVC batch:**

**Pull Debt: take on another account's debt**

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

**Use Case: Account Migration:**

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

**TypeScript: Complete view function example:**

Reference: [https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Borrowing.sol](https://github.com/euler-xyz/euler-vault-kit/blob/master/src/EVault/modules/Borrowing.sol)

### 7.4 Vault Hooks and Use Cases

**Impact: MEDIUM (Enabling custom vault logic and access control)**

Euler vaults support a hooking system that allows custom logic to be executed before operations. Hooks can implement access control, pausing, or reject operations that violate custom invariants.

**Incorrect: ignoring hook configuration on new vaults**

```solidity
// WRONG: New vaults start with all operations disabled!
// Hooks are enabled with hookTarget = address(0), which reverts
IEVault vault = IEVault(newVaultAddress);
vault.deposit(amount, receiver); // Reverts with E_OperationDisabled!
```

**Correct: understanding hook architecture**

```solidity
import {IEVault} from "evk/EVault/IEVault.sol";

IEVault vault = IEVault(vaultAddress);

// Get current hook configuration
(address hookTarget, uint32 hookedOps) = vault.hookConfig();

// hookedOps is a bitfield of operations that trigger the hook
// If hookTarget == address(0) and operation is hooked, it reverts

// Operation flags (from Constants.sol):
uint32 OP_DEPOSIT            = 1 << 0;   // deposit
uint32 OP_MINT               = 1 << 1;   // mint
uint32 OP_WITHDRAW           = 1 << 2;   // withdraw
uint32 OP_REDEEM             = 1 << 3;   // redeem
uint32 OP_TRANSFER           = 1 << 4;   // transfer, transferFrom
uint32 OP_SKIM               = 1 << 5;   // skim
uint32 OP_BORROW             = 1 << 6;   // borrow
uint32 OP_REPAY              = 1 << 7;   // repay
uint32 OP_REPAY_WITH_SHARES  = 1 << 8;   // repayWithShares
uint32 OP_PULL_DEBT          = 1 << 9;   // pullDebt
uint32 OP_CONVERT_FEES       = 1 << 10;  // convertFees
uint32 OP_LIQUIDATE          = 1 << 11;  // liquidate
uint32 OP_FLASHLOAN          = 1 << 12;  // flashLoan
uint32 OP_TOUCH              = 1 << 13;  // touch
uint32 OP_VAULT_STATUS_CHECK = 1 << 14;  // checkVaultStatus

// To enable all operations, disable all hooks:
vault.setHookConfig(address(0), 0);
```

**Correct: implementing Pause Guardian**

```solidity
import {HookTargetGuardian} from "evk-periphery/HookTarget/HookTargetGuardian.sol";

// Deploy pause guardian
HookTargetGuardian guardian = new HookTargetGuardian(
    admin,           // DEFAULT_ADMIN_ROLE holder
    1 hours,         // PAUSE_DURATION: how long pause lasts
    24 hours         // PAUSE_COOLDOWN: time before can pause again
);

// Grant guardian role to trusted address
guardian.grantRole(guardian.GUARDIAN_ROLE(), guardianAddress);

// Configure vault to use guardian for specific operations
uint32 pausableOps = OP_DEPOSIT | OP_BORROW | OP_LIQUIDATE;
vault.setHookConfig(address(guardian), pausableOps);

// Guardian can now pause/unpause
guardian.pause();    // All hooked operations will revert
guardian.unpause();  // Operations resume

// Check pause status
bool isPaused = guardian.isPaused();
uint256 remaining = guardian.remainingPauseDuration();
bool canPause = guardian.canBePaused();
```

**Correct: implementing Access Control**

```solidity
import {HookTargetAccessControl} from "evk-periphery/HookTarget/HookTargetAccessControl.sol";

// Access control hook for permissioned vaults
HookTargetAccessControl accessControl = new HookTargetAccessControl(
    eVaultFactory,
    admin
);

// Grant roles to addresses
accessControl.grantRole(accessControl.WILD_CARD(), allowedAddress);

// Configure vault
vault.setHookConfig(address(accessControl), OP_DEPOSIT | OP_BORROW);

// Now only addresses with WILD_CARD role can deposit/borrow
```

**Correct: custom hook implementation**

```solidity
import {BaseHookTarget} from "evk-periphery/HookTarget/BaseHookTarget.sol";

contract CustomHook is BaseHookTarget {
    mapping(address => bool) public allowed;
    
    constructor(address factory) BaseHookTarget(factory) {}
    
    // Hook receives same calldata as vault function
    // with the authenticated caller appended
    function deposit(uint256 assets, address receiver) external view {
        address caller = _msgSender();
        require(allowed[caller], "Not allowed");
        // If this doesn't revert, the deposit proceeds
    }
    
    function borrow(uint256 assets, address receiver) external view {
        address caller = _msgSender();
        require(allowed[caller], "Not allowed");
    }
    
    // Fallback for other operations - allow them
    fallback() external {}
}
```

**Correct: checking vault status with hooks**

```typescript
import { getContract } from 'viem';

const vault = getContract({
  address: vaultAddress,
  abi: evaultABI,
  client: publicClient,
});

const [hookTarget, hookedOps] = await vault.read.hookConfig();

// Decode hooked operations (correct bit positions)
const operations = {
  DEPOSIT: (hookedOps & (1 << 0)) !== 0,
  MINT: (hookedOps & (1 << 1)) !== 0,
  WITHDRAW: (hookedOps & (1 << 2)) !== 0,
  REDEEM: (hookedOps & (1 << 3)) !== 0,
  TRANSFER: (hookedOps & (1 << 4)) !== 0,
  SKIM: (hookedOps & (1 << 5)) !== 0,
  BORROW: (hookedOps & (1 << 6)) !== 0,
  REPAY: (hookedOps & (1 << 7)) !== 0,
  REPAY_WITH_SHARES: (hookedOps & (1 << 8)) !== 0,
  PULL_DEBT: (hookedOps & (1 << 9)) !== 0,
  CONVERT_FEES: (hookedOps & (1 << 10)) !== 0,
  LIQUIDATE: (hookedOps & (1 << 11)) !== 0,
  FLASHLOAN: (hookedOps & (1 << 12)) !== 0,
  TOUCH: (hookedOps & (1 << 13)) !== 0,
  VAULT_STATUS_CHECK: (hookedOps & (1 << 14)) !== 0,
};

console.log(`Hook Target: ${hookTarget}`);
console.log('Hooked Operations:', operations);

// If hookTarget is zero and operation is hooked, it's DISABLED
const isDepositDisabled = operations.DEPOSIT && hookTarget === '0x0000000000000000000000000000000000000000';
```

**TypeScript: Checking hook configuration:**

**Use Cases:**

| Hook Type | Purpose | Example |

|-----------|---------|---------|

| Pause Guardian | Emergency pause | Halt operations during incident |

| Access Control | Permissioned vaults | KYC/AML compliance |

| Rate Limiter | Prevent large movements | Limit deposit/withdraw per block |

| Invariant Checker | Post-condition validation | Ensure utilization bounds |

| Whitelist | Restrict interactions | Institutional-only vaults |

Reference: [https://github.com/euler-xyz/evk-periphery/blob/master/src/HookTarget/HookTargetGuardian.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/HookTarget/HookTargetGuardian.sol), [https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)

---

## 8. Security

**Impact: CRITICAL**

Security practices, audit reports, and safety guidelines for Euler integrations. Understanding security considerations is essential for building safe applications on Euler.

### 8.1 Security and Audits

**Impact: CRITICAL (Understanding security practices and audit coverage)**

Euler V2 has undergone extensive security audits and maintains an active bug bounty program. Understanding security practices is critical for safe integration.

**Security Audit Coverage:**

Euler V2 has been audited by multiple top-tier security firms:

- Trail of Bits

- OpenZeppelin

- Spearbit

- ChainSecurity

- Omniscia

- Hunter Security

- Certora (formal verification)

- yAudit (code competition)

- Cantina (code competition)

- Trail of Bits

- Spearbit

- ChainSecurity

- Hunter Security

- yAudit

- Cantina

- Certora (formal verification)

- OpenZeppelin

- Spearbit

- ChainSecurity

- Hunter Security

- yAudit

- Certora

- Pashov Audit Group

- Sigma Prime

- Spearbit

- yAudit

- Hunter Security

**Incorrect: ignoring security considerations**

```solidity
// WRONG: Using unverified vaults without checks
IEVault vault = IEVault(userProvidedVault);
vault.deposit(amount, receiver); // Could be malicious!
```

**Correct: verifying vault authenticity**

```solidity
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";
import {IPerspective} from "evk-periphery/Perspectives/implementation/interfaces/IPerspective.sol";

// Option 1: Check if deployed by official factory
GenericFactory factory = GenericFactory(EVAULT_FACTORY);
require(factory.isProxy(vaultAddress), "Not EVK vault");

// Option 2: Check if verified by Euler governance
IPerspective governedPerspective = IPerspective(GOVERNED_PERSPECTIVE);
require(governedPerspective.isVerified(vaultAddress), "Not Euler verified");

// Option 3: Check specific perspective based on vault type
IPerspective escrowPerspective = IPerspective(ESCROW_PERSPECTIVE);
bool isEscrow = escrowPerspective.isVerified(vaultAddress);
```

**Correct: safe integration patterns**

```solidity
// 1. Always use EVC for cross-vault operations
// This ensures proper status checks and atomicity
IEVC evc = IEVC(EVC_ADDRESS);

evc.batch(items); // Atomic, with deferred checks

// 2. Check account health before and after operations
(uint256 collateralValue, uint256 liabilityValue) = 
    IEVault(vault).accountLiquidity(account, false);

// 3. Use approved oracles only
address oracle = IEVault(vault).oracle();
require(isApprovedOracle(oracle), "Unknown oracle");

// 4. Verify IRM is from known factory
address irm = IEVault(vault).interestRateModel();
require(irmRegistry.isRegistered(irm), "Unknown IRM");
```

**Bug Bounty Program:**

```markdown
Severity Levels:
- Critical: Up to $2,000,000 USD
- High: Up to $100,000 USD
- Medium: Up to $25,000 USD
- Low: Up to $5,000 USD
```

Euler maintains bug bounty programs through:

- Immunefi

- Direct security contact: security@euler.xyz

**Security Best Practices:**

```typescript
// 1. Always validate external vault addresses
const isValidVault = async (vault: Address): Promise<boolean> => {
  // Check factory deployment
  const isProxy = await evaultFactory.read.isProxy([vault]);
  if (!isProxy) return false;
  
  // Check perspective verification
  const isVerified = await governedPerspective.read.isVerified([vault]);
  return isVerified;
};

// 2. Monitor for governance changes
const monitorVault = async (vault: Address) => {
  const events = await publicClient.getLogs({
    address: vault,
    event: parseAbiItem('event GovernorAdminSet(address indexed newGovernorAdmin)'),
    fromBlock: 'earliest'
  });
  // Alert on unexpected governor changes
};

// 3. Check for hook configuration
const checkHooks = async (vault: Address) => {
  const [hookTarget, hookedOps] = await evault.read.hookConfig();
  
  if (hookTarget !== zeroAddress) {
    // Vault has custom hooks - verify hook contract
    console.warn('Vault has hooks configured:', hookTarget);
  }
};

// 4. Validate oracle freshness
const checkOracle = async (vault: Address) => {
  const oracle = await evault.read.oracle();
  const price = await eulerRouter.read.getQuote([
    1n * 10n ** 18n,  // 1 unit
    asset,
    unitOfAccount
  ]);
  
  // Verify price is reasonable
  if (price === 0n) {
    throw new Error('Oracle returned zero price');
  }
};
```

**Key Security Considerations:**

| Area | Risk | Mitigation |

|------|------|------------|

| Vault authenticity | Fake vault contracts | Verify via factory/perspective |

| Oracle manipulation | Price feed attacks | Use Euler-verified oracles |

| Governance changes | Malicious parameter updates | Monitor events, use timelocks |

| Hook exploitation | Custom logic vulnerabilities | Audit hook contracts |

| Flash loan attacks | Price manipulation | Deferred liquidity checks |

| Reentrancy | State corruption | Built-in reentrancy guards |

**Formal Verification:**

Euler uses Certora for formal verification of critical invariants:

- EVC: Account/operator relationships, collateral/controller consistency

- EVault: Share/asset accounting, liquidation mechanics

- EulerEarn: Strategy allocation, share calculations

Reference: [https://docs.euler.finance/security/audits](https://docs.euler.finance/security/audits), [https://github.com/euler-xyz/ethereum-vault-connector/tree/master/audits](https://github.com/euler-xyz/ethereum-vault-connector/tree/master/audits), [https://github.com/euler-xyz/euler-vault-kit/tree/master/audits](https://github.com/euler-xyz/euler-vault-kit/tree/master/audits)

---

## 9. Developer Tools

**Impact: MEDIUM**

Tools and resources for developers including contract addresses, ABIs, subgraphs for data querying, and no-code deployment platforms. Essential for efficient Euler development.

### 9.1 Contract Addresses and ABIs

**Impact: MEDIUM (Essential reference for Euler contract integration)**

The `euler-interfaces` package provides verified contract addresses and ABIs for all supported chains. Always use this package rather than hardcoding addresses.

**Incorrect: hardcoding addresses**

```typescript
// WRONG: Addresses may differ between chains and change over time
const EVC = "0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383";
const FACTORY = "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e";
// What about Arbitrum? Base? Other chains?
// What if addresses are updated?
```

**Correct: using euler-interfaces package**

```typescript
// Install: npm install @eulerxyz/euler-interfaces

// Import chain-specific addresses
import coreMainnet from '@eulerxyz/euler-interfaces/addresses/1/CoreAddresses.json';
import peripheryMainnet from '@eulerxyz/euler-interfaces/addresses/1/PeripheryAddresses.json';
import lensMainnet from '@eulerxyz/euler-interfaces/addresses/1/LensAddresses.json';

// For other chains, use their chain ID
import coreArbitrum from '@eulerxyz/euler-interfaces/addresses/42161/CoreAddresses.json';
import coreBase from '@eulerxyz/euler-interfaces/addresses/8453/CoreAddresses.json';

// Access addresses
console.log('EVC:', coreMainnet.evc);
console.log('Factory:', coreMainnet.eVaultFactory);
console.log('VaultLens:', lensMainnet.vaultLens);
```

**Correct: dynamic chain-based loading**

```typescript
// Dynamic address loading for multi-chain apps
async function getEulerAddresses(chainId: number) {
  const core = await import(
    `@eulerxyz/euler-interfaces/addresses/${chainId}/CoreAddresses.json`
  );
  const periphery = await import(
    `@eulerxyz/euler-interfaces/addresses/${chainId}/PeripheryAddresses.json`
  );
  const lens = await import(
    `@eulerxyz/euler-interfaces/addresses/${chainId}/LensAddresses.json`
  );
  
  return { core, periphery, lens };
}

// Usage
const { core, periphery, lens } = await getEulerAddresses(1); // Mainnet
const { core: arbCore } = await getEulerAddresses(42161);     // Arbitrum
```

**Address file structure in euler-interfaces:**

```typescript
@eulerxyz/euler-interfaces/
├── addresses/
│   ├── 1/                        # Ethereum Mainnet
│   │   ├── CoreAddresses.json    # EVC, factory, protocol config
│   │   ├── PeripheryAddresses.json # IRMs, perspectives, fee flow
│   │   ├── LensAddresses.json    # Lens contracts
│   │   ├── OracleAdaptersAddresses.csv # Deployed oracles
│   │   └── ...
│   ├── 42161/                    # Arbitrum
│   ├── 8453/                     # Base
│   ├── 10/                       # Optimism
│   └── ...
└── abis/
    ├── EVault.json
    ├── EthereumVaultConnector.json
    └── ...
```

**Supported Chains:**

| Chain | Chain ID | Package Path |

|-------|----------|--------------|

| Ethereum | 1 | `addresses/1/` |

| Arbitrum | 42161 | `addresses/42161/` |

| Base | 8453 | `addresses/8453/` |

| Optimism | 10 | `addresses/10/` |

| Polygon | 137 | `addresses/137/` |

| Avalanche | 43114 | `addresses/43114/` |

| BSC | 56 | `addresses/56/` |

| Linea | 59144 | `addresses/59144/` |

| Mantle | 5000 | `addresses/5000/` |

| Berachain | 80094 | `addresses/80094/` |

| Sonic | 146 | `addresses/146/` |

**Correct: using with viem**

```typescript
import { createPublicClient, http, getContract } from 'viem';
import { mainnet } from 'viem/chains';
import core from '@eulerxyz/euler-interfaces/addresses/1/CoreAddresses.json';
import evcABI from '@eulerxyz/euler-interfaces/abis/EthereumVaultConnector.json';
import evaultABI from '@eulerxyz/euler-interfaces/abis/EVault.json';

const client = createPublicClient({
  chain: mainnet,
  transport: http()
});

// Create contract instances using imported addresses
const evc = getContract({
  address: core.evc as `0x${string}`,
  abi: evcABI,
  client
});

// Check collaterals for an account
const collaterals = await evc.read.getCollaterals([accountAddress]);
```

**Available ABIs:**

```typescript
// Core contracts
import EVault from '@eulerxyz/euler-interfaces/abis/EVault.json';
import EthereumVaultConnector from '@eulerxyz/euler-interfaces/abis/EthereumVaultConnector.json';
import GenericFactory from '@eulerxyz/euler-interfaces/abis/GenericFactory.json';

// Oracle
import EulerRouter from '@eulerxyz/euler-interfaces/abis/EulerRouter.json';

// EulerEarn
import EulerEarn from '@eulerxyz/euler-interfaces/abis/EulerEarn.json';
import EulerEarnFactory from '@eulerxyz/euler-interfaces/abis/EulerEarnFactory.json';
import PublicAllocator from '@eulerxyz/euler-interfaces/abis/PublicAllocator.json';

// EulerSwap
import EulerSwap from '@eulerxyz/euler-interfaces/abis/EulerSwap.json';
import EulerSwapFactory from '@eulerxyz/euler-interfaces/abis/EulerSwapFactory.json';

// Lens
import VaultLens from '@eulerxyz/euler-interfaces/abis/VaultLens.json';
import AccountLens from '@eulerxyz/euler-interfaces/abis/AccountLens.json';
import OracleLens from '@eulerxyz/euler-interfaces/abis/OracleLens.json';
import IRMLens from '@eulerxyz/euler-interfaces/abis/IRMLens.json';

// Periphery
import FeeFlowController from '@eulerxyz/euler-interfaces/abis/FeeFlowController.json';
import RewardToken from '@eulerxyz/euler-interfaces/abis/RewardToken.json';
import TrackingRewardStreams from '@eulerxyz/euler-interfaces/abis/TrackingRewardStreams.json';
```

**Correct: Solidity remapping**

```solidity
// In remappings.txt for Foundry
euler-interfaces/=node_modules/@eulerxyz/euler-interfaces/

// In Solidity
import {IEVault} from "euler-interfaces/interfaces/IEVault.sol";
import {IEVC} from "euler-interfaces/interfaces/IEVC.sol";
```

Always refer to the euler-interfaces package for the most up-to-date addresses. The package is maintained by Euler Labs and updated when new contracts are deployed.

Reference: [https://github.com/euler-xyz/euler-interfaces](https://github.com/euler-xyz/euler-interfaces)

### 9.2 Creator Tools and Deployment Resources

**Impact: MEDIUM (Tools for deploying and managing Euler vaults)**

Euler provides multiple tools for creating and managing vaults, from no-code platforms to scripting libraries.

**Available Creator Tools:**

```solidity
// From euler-vault-scripts repository

// Deploy a new vault cluster
forge script script/DeployVaultCluster.s.sol \
    --rpc-url $RPC_URL \
    --broadcast

// Configure LTV relationships
forge script script/ConfigureLTV.s.sol \
    --rpc-url $RPC_URL \
    --broadcast

// Emergency governance procedures
forge script script/EmergencyPause.s.sol \
    --rpc-url $RPC_URL \
    --broadcast
```

A bare-bones no-code platform for creating and managing lending vaults on Euler.

Tool for deploying and managing price oracles for Euler markets.

Collection of scripts for deploying, configuring, and managing vault clusters.

**Correct: deploying vault via script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";
import {IEVault} from "evk/EVault/IEVault.sol";

contract DeployVault is Script {
    // Mainnet addresses
    address constant EVAULT_FACTORY = 0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e;
    address constant KINK_IRM_FACTORY = 0xcAe0A39B45Ee9C3213f64392FA6DF30CE034C9F9;
    address constant ORACLE_ROUTER_FACTORY = 0x70B3f6F61b7Bf237DF04589DdAA842121072326A;
    
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        
        // 1. Deploy IRM
        address irm = IKinkIRMFactory(KINK_IRM_FACTORY).deploy(
            0,           // baseRate
            1.585e25,    // slope1 (~5% APY at kink)
            13.16e27,    // slope2 (~300% at 100%)
            0.9e9        // kink (90%)
        );
        
        // 2. Deploy oracle router
        address router = IEulerRouterFactory(ORACLE_ROUTER_FACTORY).deploy(
            msg.sender   // governor
        );
        
        // 3. Configure oracle adapters
        IEulerRouter(router).govSetConfig(
            asset,
            unitOfAccount,
            oracleAdapter
        );
        
        // 4. Deploy vault
        bytes memory trailingData = abi.encodePacked(
            asset,
            router,
            unitOfAccount
        );
        address vault = GenericFactory(EVAULT_FACTORY).createProxy(
            address(0),  // no salt
            true,        // upgradeable
            trailingData
        );
        
        // 5. Configure vault
        IEVault(vault).setInterestRateModel(irm);
        IEVault(vault).setHookConfig(address(0), 0);
        // Caps use AmountCap uint16 encoding (0 = unlimited)
        // See AmountCap.sol for encoding formula
        IEVault(vault).setCaps(0, 0); // 0 = no cap
        IEVault(vault).setInterestFee(0.1e4); // 10%
        
        // 6. Configure LTV for collaterals
        IEVault(vault).setLTV(
            collateralVault,
            0.75e4,     // 75% borrow LTV
            0.85e4,     // 85% liquidation LTV
            0           // no ramp
        );
        
        vm.stopBroadcast();
        
        console.log("Vault deployed:", vault);
    }
}
```

**Correct: using EdgeFactory for ungoverned vaults**

```typescript
// euler-interfaces provides contract addresses and ABIs
import addresses from '@eulerxyz/euler-interfaces/addresses/1/CoreAddresses.json';
import periphery from '@eulerxyz/euler-interfaces/addresses/1/PeripheryAddresses.json';
import evaultABI from '@eulerxyz/euler-interfaces/abis/EVault.json';

// Core addresses
const evc = addresses.evc;
const evaultFactory = addresses.eVaultFactory;
const eulerEarnFactory = addresses.eulerEarnFactory;

// Periphery addresses
const kinkIrmFactory = periphery.kinkIRMFactory;
const oracleRouterFactory = periphery.oracleRouterFactory;
const governedPerspective = periphery.governedPerspective;

// Create contract instance
const vault = getContract({
  address: vaultAddress,
  abi: evaultABI,
  client: walletClient,
});
```

**TypeScript: Using euler-interfaces package:**

**Development Workflow:**

```bash
# 1. Clone vault scripts repo
git clone https://github.com/euler-xyz/euler-vault-scripts

# 2. Install dependencies
cd euler-vault-scripts
./install.sh

# 3. Configure environment
cp .env.example .env
# Edit .env with RPC_URL and PRIVATE_KEY

# 4. Deploy vault cluster
forge script script/DeployVaultCluster.s.sol \
    --rpc-url $RPC_URL \
    --broadcast \
    --verify

# 5. Verify on Etherscan
forge verify-contract $VAULT_ADDRESS EVault \
    --chain mainnet
```

Reference: [https://github.com/euler-xyz/euler-vault-scripts](https://github.com/euler-xyz/euler-vault-scripts), [https://create.euler.finance](https://create.euler.finance)

### 9.3 Data Querying with Subgraphs

**Impact: MEDIUM (Efficiently querying historical and aggregated data)**

Euler provides subgraphs deployed via Goldsky for efficient querying of historical data, vault statistics, and account positions across all supported chains.

**Incorrect: querying everything on-chain**

```typescript
// WRONG: Fetching all vault positions on-chain is expensive and slow
const allVaults = await factory.read.getAllProxies();
for (const vault of allVaults) {
  const info = await vault.read.getVaultInfo(); // Many RPC calls!
}
```

**Correct: using Subgraph for aggregated data**

```typescript
// Subgraphs are deployed via Goldsky
// Check docs.euler.finance for current endpoint URLs

// Supported networks (as of 2025):
// mainnet, arbitrum, base, swell, sonic, ink, unichain, avalanche,
// berachain, bob, bsc, worldchain, hyperevm, optimism, gnosis,
// tac, linea, plasma, mantle, monad
```

**Correct: querying vault data**

```graphql
# Get all vaults with their configuration
query GetVaults {
  eulerVaults(first: 100, orderBy: blockTimestamp, orderDirection: desc) {
    id
    evault
    name
    symbol
    asset
    decimals
    supplyCap
    borrowCap
    interestFee
    oracle
    unitOfAccount
    governonAdmin
    feeReceiver
    creator
    interestRateModel
    collaterals
    perspectives
    blockTimestamp
  }
}
```

**Correct: querying vault status/state**

```graphql
# Get vault status with TVL and rates
query GetVaultStatus($vault: Bytes!) {
  vaultStatuses(
    where: { vault: $vault }
    orderBy: timestamp
    orderDirection: desc
    first: 1
  ) {
    id
    vault
    totalShares
    totalBorrows
    cash
    accumulatedFees
    interestAccumulator
    interestRate
    supplyApy
    borrowApy
    timestamp
    blockTimestamp
  }
}
```

**Correct: querying account balances via TrackingVaultBalance**

```graphql
# Get all positions for an account
# Note: Account entity only has id, subAccount, owner
# Use TrackingVaultBalance for position data
query GetAccountPositions($mainAddress: Bytes!) {
  trackingVaultBalances(where: { mainAddress: $mainAddress }) {
    id
    vault
    mainAddress
    account
    balance
    debt
    isControllerEnabled
    blockTimestamp
  }
}
```

**Correct: querying interest rate history**

```typescript
import { request, gql } from 'graphql-request';

// Get current endpoint from docs.euler.finance
const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/.../euler-mainnet/gn';

// Query vault information
const getVaultInfo = async (vaultAddress: string) => {
  const query = gql`
    query GetVault($id: Bytes!) {
      eulerVault(id: $id) {
        id
        evault
        name
        symbol
        asset
        decimals
        supplyCap
        borrowCap
        interestFee
        oracle
        unitOfAccount
        collaterals
        governonAdmin
        feeReceiver
        creator
        blockTimestamp
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { id: vaultAddress.toLowerCase() });
};

// Query vault current state
const getVaultStatus = async (vaultAddress: string) => {
  const query = gql`
    query GetVaultStatus($vault: Bytes!) {
      vaultStatuses(
        where: { vault: $vault }
        orderBy: timestamp
        orderDirection: desc
        first: 1
      ) {
        totalShares
        totalBorrows
        cash
        interestRate
        supplyApy
        borrowApy
        timestamp
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { vault: vaultAddress.toLowerCase() });
};

// Query user positions
const getUserPositions = async (account: string) => {
  const query = gql`
    query GetUserPositions($mainAddress: Bytes!) {
      trackingVaultBalances(
        where: { mainAddress: $mainAddress, balance_gt: "0" }
      ) {
        vault
        balance
        debt
        isControllerEnabled
        blockTimestamp
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { mainAddress: account.toLowerCase() });
};

// Query historical APY
const getHistoricalAPY = async (vault: string, days: number = 30) => {
  const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  
  const query = gql`
    query GetAPYHistory($vault: Bytes!, $since: BigInt!) {
      vaultStatuses(
        where: { vault: $vault, timestamp_gte: $since }
        orderBy: timestamp
        first: 1000
      ) {
        timestamp
        interestRate
        supplyApy
        borrowApy
        totalShares
        totalBorrows
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { 
    vault: vault.toLowerCase(), 
    since: since.toString() 
  });
};
```

**TypeScript: Complete subgraph integration:**

**Correct: querying liquidation events**

```graphql
# Get recent liquidations
query GetLiquidations($since: BigInt!) {
  liquidates(
    where: { blockTimestamp_gte: $since }
    orderBy: blockTimestamp
    orderDirection: desc
    first: 100
  ) {
    id
    blockTimestamp
    liquidator
    violator
    vault
    collateral
    repayAssets
    yieldBalance
    transactionHash
  }
}
```

**Correct: querying deposits and withdrawals**

```graphql
# Get deposit events
query GetDeposits($vault: Bytes!, $since: BigInt!) {
  deposits(
    where: { vault: $vault, blockTimestamp_gte: $since }
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    id
    sender
    owner
    assets
    shares
    vault
    blockTimestamp
    transactionHash
  }
}

# Get withdrawal events
query GetWithdrawals($vault: Bytes!, $since: BigInt!) {
  withdraws(
    where: { vault: $vault, blockTimestamp_gte: $since }
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    id
    sender
    receiver
    owner
    assets
    shares
    vault
    blockTimestamp
    transactionHash
  }
}
```

**Correct: querying Euler Earn vaults**

```graphql
# Get Euler Earn aggregator vaults
query GetEulerEarnVaults {
  eulerEarnVaults(first: 100) {
    id
    name
    symbol
    asset
    owner
    curator
    guardian
    feeReceiver
    performanceFee
    timelock
    totalShares
    totalAssets
    totalAllocated
    supplyQueue
    blockTimestamp
  }
}
```

**Combining Subgraph with On-Chain Data:**

```typescript
// Best practice: Use subgraph for discovery, on-chain for current state

// 1. Use subgraph to find relevant vaults
const vaultsQuery = gql`
  query {
    eulerVaults(first: 20, orderBy: blockTimestamp, orderDirection: desc) {
      evault
      name
      symbol
      asset
    }
  }
`;
const topVaults = await request(SUBGRAPH_URL, vaultsQuery);

// 2. Use on-chain for real-time data
const vaultLens = getContract({
  address: VAULT_LENS,
  abi: vaultLensABI,
  client
});

for (const vault of topVaults.eulerVaults) {
  // Get current state on-chain (more accurate)
  const info = await vaultLens.read.getVaultInfoDynamic([vault.evault]);
  
  // Combine with historical data from subgraph
  const history = await getHistoricalAPY(vault.evault, 7);
  
  console.log(`${vault.symbol}: Current APY ${info.supplyAPY}`);
}
```

**Available Subgraph Entities:**

| Entity | Key Fields | Use Case |

|--------|------------|----------|

| EulerVault | evault, asset, caps, oracle | Vault discovery & config |

| VaultStatus | totalShares, totalBorrows, APYs | TVL, rates, utilization |

| TrackingVaultBalance | balance, debt, vault | User positions |

| Liquidate | violator, repayAssets, collateral | Liquidation events |

| Deposit/Withdraw | assets, shares, sender | Transaction history |

| Borrow/Repay | assets, account | Borrow activity |

| EulerEarnVault | totalAssets, strategies | Earn aggregators |

| EulerSwapPool | reserves, fee, assets | Swap pool data |

Reference: [https://github.com/euler-xyz/euler-subgraph](https://github.com/euler-xyz/euler-subgraph)

### 9.4 Lens Contracts for Data Queries

**Impact: MEDIUM (Essential for reading comprehensive vault and account data)**

Lens contracts provide read-only aggregated views of Euler protocol data. They simplify complex multi-call queries into single function calls, returning structured data about vaults, accounts, oracles, and interest rate models.

**Available Lens Contracts:**

| Lens | Purpose |

|------|---------|

| AccountLens | Account positions, liquidity, health, time to liquidation |

| VaultLens | Vault configuration, state, LTVs, rewards |

| OracleLens | Oracle configuration and validation |

| IRMLens | Interest rate model parameters |

| UtilsLens | APY calculations, token balances, price queries |

| EulerEarnVaultLens | EulerEarn vault strategies and allocations |

**Incorrect: making many individual calls**

```typescript
// WRONG: Multiple calls, complex assembly, easy to miss data
const totalAssets = await vault.read.totalAssets();
const totalBorrows = await vault.read.totalBorrows();
const cash = await vault.read.cash();
const governor = await vault.read.governorAdmin();
const irm = await vault.read.interestRateModel();
// ... many more calls needed
```

**Correct: using VaultLens for comprehensive vault data**

```typescript
import { getContract } from 'viem';
import lens from '@eulerxyz/euler-interfaces/addresses/1/LensAddresses.json';
import vaultLensABI from '@eulerxyz/euler-interfaces/abis/VaultLens.json';

const vaultLens = getContract({
  address: lens.vaultLens as Address,
  abi: vaultLensABI,
  client: publicClient
});

// Get all vault info in one call
const vaultInfo = await vaultLens.read.getVaultInfoFull([vaultAddress]);

console.log(`Vault: ${vaultInfo.vaultName} (${vaultInfo.vaultSymbol})`);
console.log(`Asset: ${vaultInfo.assetName} (${vaultInfo.assetDecimals} decimals)`);
console.log(`Total Assets: ${vaultInfo.totalAssets}`);
console.log(`Total Borrowed: ${vaultInfo.totalBorrowed}`);
console.log(`Supply Cap: ${vaultInfo.supplyCap}`);
console.log(`Borrow Cap: ${vaultInfo.borrowCap}`);
console.log(`Governor: ${vaultInfo.governorAdmin}`);
console.log(`Oracle: ${vaultInfo.oracle}`);
console.log(`IRM: ${vaultInfo.interestRateModel}`);

// LTV info for each collateral
for (const ltv of vaultInfo.collateralLTVInfo) {
  console.log(`Collateral ${ltv.collateral}: borrow=${ltv.borrowLTV}, liq=${ltv.liquidationLTV}`);
}
```

**Correct: using AccountLens for position data**

```typescript
import accountLensABI from '@eulerxyz/euler-interfaces/abis/AccountLens.json';

const accountLens = getContract({
  address: lens.accountLens as Address,
  abi: accountLensABI,
  client: publicClient
});

// Get full account info for a specific vault
const accountInfo = await accountLens.read.getAccountInfo([account, vaultAddress]);

// EVC account state
const evcInfo = accountInfo.evcAccountInfo;
console.log(`Owner: ${evcInfo.owner}`);
console.log(`Controllers: ${evcInfo.enabledControllers}`);
console.log(`Collaterals: ${evcInfo.enabledCollaterals}`);
console.log(`Lockdown Mode: ${evcInfo.isLockdownMode}`);

// Vault position
const vaultInfo = accountInfo.vaultAccountInfo;
console.log(`Shares: ${vaultInfo.shares}`);
console.log(`Assets (deposits): ${vaultInfo.assets}`);
console.log(`Borrowed: ${vaultInfo.borrowed}`);
console.log(`Is Controller: ${vaultInfo.isController}`);
console.log(`Is Collateral: ${vaultInfo.isCollateral}`);

// Liquidity and health
const liq = vaultInfo.liquidityInfo;
console.log(`Collateral Value (borrow): ${liq.collateralValueBorrowing}`);
console.log(`Collateral Value (liq): ${liq.collateralValueLiquidation}`);
console.log(`Liability Value: ${liq.liabilityValueLiquidation}`);
console.log(`Time to Liquidation: ${liq.timeToLiquidation}`);
```

**Correct: using AccountLens for liquidity info only**

```typescript
// Quick health check without full account info
const liquidityInfo = await accountLens.read.getAccountLiquidityInfo([
  account,
  controllerVault
]);

if (liquidityInfo.queryFailure) {
  console.error('Query failed:', liquidityInfo.queryFailureReason);
  return;
}

// Calculate health factor
const health = liquidityInfo.liabilityValueLiquidation > 0n
  ? (liquidityInfo.collateralValueLiquidation * 10n ** 18n) / liquidityInfo.liabilityValueLiquidation
  : MaxUint256;

console.log(`Health Factor: ${formatUnits(health, 18)}`);

// Time to liquidation (special values)
const TTL_INFINITY = await accountLens.read.TTL_INFINITY();
const TTL_LIQUIDATION = await accountLens.read.TTL_LIQUIDATION();

if (liquidityInfo.timeToLiquidation === TTL_INFINITY) {
  console.log('Safe: Infinite time to liquidation');
} else if (liquidityInfo.timeToLiquidation === TTL_LIQUIDATION) {
  console.log('DANGER: Already liquidatable!');
} else if (liquidityInfo.timeToLiquidation > 0) {
  console.log(`Time to liquidation: ${liquidityInfo.timeToLiquidation} seconds`);
}
```

**Correct: using VaultLens for IRM curve data**

```typescript
// Get interest rate model info with custom utilization points
const utilizationPoints = [
  { cash: 90n * 10n ** 18n, borrows: 10n * 10n ** 18n },   // 10% utilization
  { cash: 50n * 10n ** 18n, borrows: 50n * 10n ** 18n },   // 50% utilization
  { cash: 10n * 10n ** 18n, borrows: 90n * 10n ** 18n },   // 90% utilization
  { cash: 5n * 10n ** 18n, borrows: 95n * 10n ** 18n },    // 95% utilization
];

const cashArray = utilizationPoints.map(p => p.cash);
const borrowsArray = utilizationPoints.map(p => p.borrows);

const irmInfo = await vaultLens.read.getVaultInterestRateModelInfo([
  vaultAddress,
  cashArray,
  borrowsArray
]);

// Plot the interest rate curve
for (let i = 0; i < irmInfo.interestRateInfo.length; i++) {
  const info = irmInfo.interestRateInfo[i];
  const utilization = (info.borrows * 100n) / (info.cash + info.borrows);
  console.log(`${utilization}% util: Borrow APY=${info.borrowAPY}, Supply APY=${info.supplyAPY}`);
}

// For kink IRM, get standard curve points
const kinkIrmInfo = await vaultLens.read.getVaultKinkInterestRateModelInfo([vaultAddress]);
console.log(`IRM Type: ${kinkIrmInfo.interestRateModelInfo.interestRateModelType}`);
```

**Correct: using OracleLens for oracle validation**

```typescript
import oracleLensABI from '@eulerxyz/euler-interfaces/abis/OracleLens.json';

const oracleLens = getContract({
  address: lens.oracleLens as Address,
  abi: oracleLensABI,
  client: publicClient
});

// Get oracle info for multiple base/quote pairs
const bases = [wethAddress, wbtcAddress, linkAddress];
const quotes = [usdAddress, usdAddress, usdAddress];

const oracleInfo = await oracleLens.read.getOracleInfo([
  routerAddress,
  bases,
  quotes
]);

console.log(`Oracle: ${oracleInfo.name}`);
console.log(`Oracle Address: ${oracleInfo.oracle}`);
// oracleInfo.oracleInfo contains encoded adapter-specific info

// Check for stale pull oracles (Pyth, RedStone)
const isStale = await oracleLens.read.isStalePullOracle([
  oracleAddress,
  '0x' // failure reason bytes
]);

if (isStale) {
  console.warn('Oracle prices are stale - update required!');
}

// Get valid oracle adapters for a pair
const validAdapters = await oracleLens.read.getValidAdapters([
  baseToken,
  quoteToken
]);
console.log('Valid adapters:', validAdapters);
```

**Correct: using UtilsLens for calculations**

```typescript
import utilsLensABI from '@eulerxyz/euler-interfaces/abis/UtilsLens.json';

const utilsLens = getContract({
  address: lens.utilsLens as Address,
  abi: utilsLensABI,
  client: publicClient
});

// Get APYs for a vault
const [borrowAPY, supplyAPY] = await utilsLens.read.getAPYs([vaultAddress]);
console.log(`Borrow APY: ${formatUnits(borrowAPY, 25)}%`);  // 1e27 scale
console.log(`Supply APY: ${formatUnits(supplyAPY, 25)}%`);

// Batch token balances
const tokens = [wethAddress, usdcAddress, daiAddress];
const balances = await utilsLens.read.tokenBalances([account, tokens]);
tokens.forEach((token, i) => {
  console.log(`${token}: ${balances[i]}`);
});

// Batch token allowances
const allowances = await utilsLens.read.tokenAllowances([
  spenderAddress,
  account,
  tokens
]);

// Get ERC4626 vault info (works for any 4626 vault)
const vaultInfo = await utilsLens.read.getVaultInfoERC4626([vaultAddress]);
console.log(`Is EVault: ${vaultInfo.isEVault}`);
console.log(`Share/Asset ratio: ${vaultInfo.totalAssets / vaultInfo.totalShares}`);

// Calculate time to liquidation
const ttl = await utilsLens.read.calculateTimeToLiquidation([
  liabilityVault,
  liabilityValue,
  collateralAddresses,
  collateralValues
]);
```

**Correct: using EulerEarnVaultLens for yield strategies**

```solidity
import {IVaultLens} from "euler-interfaces/interfaces/IVaultLens.sol";
import {IAccountLens} from "euler-interfaces/interfaces/IAccountLens.sol";

contract MyContract {
    IVaultLens public vaultLens;
    IAccountLens public accountLens;
    
    constructor(address _vaultLens, address _accountLens) {
        vaultLens = IVaultLens(_vaultLens);
        accountLens = IAccountLens(_accountLens);
    }
    
    function getAccountHealth(address account, address vault) 
        external 
        view 
        returns (uint256 health) 
    {
        IAccountLens.AccountLiquidityInfo memory liq = 
            accountLens.getAccountLiquidityInfo(account, vault);
        
        if (liq.queryFailure) revert("Query failed");
        if (liq.liabilityValueLiquidation == 0) return type(uint256).max;
        
        health = (liq.collateralValueLiquidation * 1e18) / liq.liabilityValueLiquidation;
    }
    
    function getVaultUtilization(address vault) 
        external 
        view 
        returns (uint256 utilization) 
    {
        IVaultLens.VaultInfoDynamic memory info = 
            vaultLens.getVaultInfoDynamic(vault);
        
        uint256 total = info.totalCash + info.totalBorrowed;
        if (total == 0) return 0;
        
        utilization = (info.totalBorrowed * 1e18) / total;
    }
}
```

**Solidity: Using Lens contracts on-chain:**

**Key Lens Functions Summary:**

| Lens | Function | Returns |

|------|----------|---------|

| VaultLens | `getVaultInfoFull(vault)` | Complete vault config + state |

| VaultLens | `getVaultInfoDynamic(vault)` | Current state only |

| VaultLens | `getVaultInfoStatic(vault)` | Immutable config only |

| VaultLens | `getRecognizedCollateralsLTVInfo(vault)` | LTV for all collaterals |

| VaultLens | `getVaultKinkInterestRateModelInfo(vault)` | IRM curve data |

| AccountLens | `getAccountInfo(account, vault)` | Full account position |

| AccountLens | `getAccountLiquidityInfo(account, vault)` | Health and liquidation info |

| AccountLens | `getTimeToLiquidation(account, vault)` | Seconds until liquidatable |

| OracleLens | `getOracleInfo(oracle, bases, quotes)` | Oracle configuration |

| OracleLens | `isStalePullOracle(oracle, reason)` | Check for stale Pyth/RedStone |

| UtilsLens | `getAPYs(vault)` | Current borrow/supply APY |

| UtilsLens | `tokenBalances(account, tokens)` | Batch balance query |

| EulerEarnLens | `getVaultInfoFull(vault)` | Earn vault with strategies |

Reference: [https://github.com/euler-xyz/evk-periphery/tree/master/src/Lens](https://github.com/euler-xyz/evk-periphery/tree/master/src/Lens)

---

## 10. EulerEarn

**Impact: MEDIUM**

Yield aggregation protocol built on top of Euler vaults. Enables creating meta-vaults that allocate across multiple strategies, with role-based access control (owner, curator, guardian, allocator) and timelocked governance.

### 10.1 Create an EulerEarn Vault

**Impact: MEDIUM (Deploy yield aggregation vaults)**

EulerEarn vaults are yield aggregation meta-vaults that allocate deposited assets across multiple ERC-4626 strategy vaults. They provide passive yield optimization with role-based governance.

**Incorrect: deploying without proper initialization**

```solidity
// Don't deploy EulerEarn directly - use factory
EulerEarn vault = new EulerEarn();
// Missing proper initialization, not tracked by factory
```

**Correct: deploy via EulerEarnFactory**

```solidity
import {EulerEarnFactory} from "euler-earn/EulerEarnFactory.sol";
import {IEulerEarn} from "euler-earn/interfaces/IEulerEarn.sol";

// Deploy EulerEarn vault via factory
// Parameters: initialOwner, initialTimelock, asset, name, symbol, salt
address earnVault = EulerEarnFactory(factory).createEulerEarn(
    initialOwner,       // Address that becomes vault owner
    0,                  // Initial timelock (can be 0)
    asset,              // Underlying asset (e.g., USDC)
    name,               // Vault name (e.g., "Euler USDC Earn")
    symbol,             // Vault symbol (e.g., "eUSDC")
    bytes32(0)          // Salt for CREATE2 (0 for default)
);

IEulerEarn earn = IEulerEarn(earnVault);
```

**Correct: configure vault after deployment**

```solidity
// Set fee (max 50%)
earn.setFeeRecipient(treasuryAddress);
earn.setFee(0.1e18); // 10% of yield (setFee, not setPerformanceFee)

// Set timelock for governance actions (two-step process)
// Initial timelock can be 0, but subsequent changes are timelocked
// Step 1: Submit new timelock value
earn.submitTimelock(24 hours);
// Step 2: After current timelock elapses, accept the new value
earn.acceptTimelock();

// Set guardian for emergency actions (also two-step if timelock > 0)
earn.submitGuardian(guardianAddress);

// Set curator for strategy management
earn.setCurator(curatorAddress);

// Add allocators who can rebalance
earn.setIsAllocator(allocatorAddress, true);
```

**Correct: add strategy vaults**

```solidity
// Strategy vaults must be ERC-4626 compliant
// EVK vaults are preferred due to built-in protections

// Submit cap for a strategy (timelocked if timelock > 0)
// Note: submitCap takes IERC4626, not address
earn.submitCap(
    IERC4626(strategyVault),  // IERC4626 strategy vault
    100_000e6                  // Supply cap (e.g., 100k USDC)
);

// After timelock, accept the cap
earn.acceptCap(IERC4626(strategyVault));

// Add strategy to supply queue (order matters)
// Note: setSupplyQueue takes IERC4626[] not address[]
IERC4626[] memory newSupplyQueue = new IERC4626[](2);
newSupplyQueue[0] = IERC4626(strategyVault1);  // First priority
newSupplyQueue[1] = IERC4626(strategyVault2);  // Second priority
earn.setSupplyQueue(newSupplyQueue);

// Withdraw queue contains all strategies with allocation
// Updated automatically, but can be reordered
```

**Correct: TypeScript vault creation**

```typescript
import { encodeFunctionData } from 'viem';

// Deploy earn vault via factory
const earnVaultAddress = await eulerEarnFactory.write.createEulerEarn([
  ownerAddress,          // initialOwner
  0n,                    // initialTimelock
  usdcAddress,           // asset
  'Euler USDC Earn',     // name
  'eUSDC',               // symbol
  '0x0000000000000000000000000000000000000000000000000000000000000000', // salt
]);

// Configure in batch
const setupCalls = [
  encodeFunctionData({
    abi: eulerEarnABI,
    functionName: 'setFeeRecipient',
    args: [treasuryAddress],
  }),
  encodeFunctionData({
    abi: eulerEarnABI,
    functionName: 'setFee',
    args: [0.1e18], // 10%
  }),
  encodeFunctionData({
    abi: eulerEarnABI,
    functionName: 'setCurator',
    args: [curatorAddress],
  }),
  encodeFunctionData({
    abi: eulerEarnABI,
    functionName: 'setGuardian',
    args: [guardianAddress],
  }),
];

// Execute setup
for (const call of setupCalls) {
  await ownerWallet.sendTransaction({
    to: earnVaultAddress,
    data: call,
  });
}
```

**Role permissions overview:**

| Role | Capabilities |

|------|-------------|

| Owner | All actions, set other roles, set fee |

| Curator | Manage caps, submit removals, do allocator actions |

| Guardian | Revoke pending changes, emergency stops |

| Allocator | Set queues, reallocate funds |

**Non-borrowable idle vault setup:**

```solidity
// For guaranteed liquidity, add a non-borrowable "idle" strategy
// This ensures some funds are always withdrawable

// Create or use an Escrow Vault (non-borrowable EVK)
address escrowVault = createEscrowVault(asset);

// Add to EulerEarn with infinite cap
earn.submitCap(escrowVault, type(uint184).max);
// Wait for timelock...
earn.acceptCap(escrowVault);

// Put at end of supply queue (last priority)
// Funds only go here if other strategies are full
```

Reference: [https://github.com/euler-xyz/euler-earn#readme](https://github.com/euler-xyz/euler-earn#readme)

### 10.2 Manage EulerEarn Strategies

**Impact: MEDIUM (Optimize yield through strategy allocation)**

Strategy management involves adjusting allocations across ERC-4626 vaults to optimize yield while maintaining risk parameters. This is done by curators and allocators.

**Incorrect: reallocating without checking liquidity**

```solidity
// This may fail if strategy doesn't have enough liquidity
earn.reallocate(
    [strategyA, strategyB],
    [type(uint256).max, 0]  // Withdraw all from A
);
// Error: strategy may have utilization, funds locked
```

**Correct: check liquidity before reallocating**

```solidity
// Check available liquidity in each strategy
function getStrategyLiquidity(address strategy) 
    public view returns (uint256) 
{
    // For EVK vaults, check cash available
    try IEVault(strategy).cash() returns (uint256 cash) {
        return cash;
    } catch {
        // For generic ERC-4626, estimate via maxWithdraw
        return IERC4626(strategy).maxWithdraw(address(earn));
    }
}

// Reallocate respecting liquidity
uint256 availableLiquidity = getStrategyLiquidity(fromStrategy);
uint256 toWithdraw = min(desiredAmount, availableLiquidity);

// reallocate takes MarketAllocation[] struct array
// struct MarketAllocation { IERC4626 id; uint256 assets; }
// 
// CRITICAL: The assets field specifies the TARGET allocation, not the delta!
// - assets = 0: Withdraw everything from this strategy
// - assets = N: Leave exactly N assets in this strategy  
// - assets = type(uint256).max: Deposit all available cash into this strategy
//
// Order matters: withdrawals should come before deposits

MarketAllocation[] memory allocations = new MarketAllocation[](2);
allocations[0] = MarketAllocation({
    id: IERC4626(fromStrategy),
    assets: 0  // Target: leave 0 assets (withdraws everything)
});
allocations[1] = MarketAllocation({
    id: IERC4626(toStrategy),
    assets: type(uint256).max  // Target: deposit all available cash
});

earn.reallocate(allocations);
```

**Correct: updating supply queue priority**

```typescript
// Supply queue determines deposit order
// First strategy gets filled first, then second, etc.

// Current queue: [vaultA, vaultB, vaultC]
// Want to prioritize vaultB for higher yield

const newSupplyQueue = [vaultB, vaultA, vaultC];

await earn.write.setSupplyQueue([newSupplyQueue]);

// Now deposits flow: vaultB (until cap) -> vaultA -> vaultC
```

**Correct: updating withdraw queue for liquidity**

```solidity
// Withdraw queue determines withdrawal order
// Put most liquid strategies first for user experience

// Get current allocations
uint256[] memory allocations = new uint256[](strategies.length);
for (uint256 i = 0; i < strategies.length; i++) {
    allocations[i] = IERC4626(strategies[i]).balanceOf(address(earn));
}

// updateWithdrawQueue takes uint256[] indexes, NOT addresses
// The indexes represent the new order of the current withdraw queue
// Example: To swap positions 0 and 1 in a 3-element queue: [1, 0, 2]
uint256[] memory newOrder = sortByLiquidityIndexes(strategies);
earn.updateWithdrawQueue(newOrder);
```

**Correct: reducing strategy cap safely**

```solidity
// To reduce exposure to a strategy:

// Step 1: Reduce cap (instant for curator/owner)
earn.submitCap(riskyStrategy, newLowerCap);
// No timelock for cap reduction!

// Step 2: If over cap, reallocate excess
uint256 currentAllocation = earn.expectedSupplyAssets(IERC4626(riskyStrategy));
if (currentAllocation > newLowerCap) {
    // reallocate takes MarketAllocation[] struct array
    // Set target allocation for risky strategy to the new cap
    MarketAllocation[] memory allocations = new MarketAllocation[](2);
    allocations[0] = MarketAllocation({
        id: IERC4626(riskyStrategy),
        assets: newLowerCap  // Target: reduce to new cap
    });
    allocations[1] = MarketAllocation({
        id: IERC4626(safeStrategy),
        assets: type(uint256).max  // Target: deposit all freed assets
    });
    
    earn.reallocate(allocations);
}
```

**Correct: emergency strategy removal**

```solidity
// If a strategy is reverting/compromised:

// Step 1: Set cap to 0
earn.submitCap(brokenStrategy, 0);

// Step 2: Submit forced removal (starts timelock)
// Note: Takes IERC4626, not address
earn.submitMarketRemoval(IERC4626(brokenStrategy));

// Step 3: Wait for timelock

// Step 4: After timelock, update withdraw queue with new indexes
// updateWithdrawQueue takes uint256[] indexes to reorder/remove
// To remove an entry, omit its index from the array
// WARNING: Funds in removed strategy are considered lost!
uint256[] memory newIndexes = getQueueWithoutBrokenStrategy();
earn.updateWithdrawQueue(newIndexes);
```

**Correct: monitoring and rebalancing**

```typescript
interface StrategyMetrics {
  address: Address;
  allocation: bigint;
  apy: number;
  utilization: number;
  liquidity: bigint;
}

async function getStrategyMetrics(
  earn: Address,
  strategy: Address
): Promise<StrategyMetrics> {
  const allocation = await IERC4626(strategy).balanceOf(earn);
  const vaultInfo = await vaultLens.getVaultInfoDynamic(strategy);
  
  return {
    address: strategy,
    allocation,
    apy: vaultInfo.irmInfo.interestRateInfo[0].supplyAPY / 1e25,
    utilization: vaultInfo.totalBorrowed / vaultInfo.totalAssets,
    liquidity: vaultInfo.totalCash,
  };
}

async function optimizeAllocation(earn: Address) {
  const strategies = await earn.withdrawQueue();
  const metrics = await Promise.all(
    strategies.map(s => getStrategyMetrics(earn, s))
  );
  
  // Sort by APY descending
  const byApy = [...metrics].sort((a, b) => b.apy - a.apy);
  
  // Reallocate to higher-yield strategies (respecting caps and liquidity)
  for (const highYield of byApy.slice(0, 3)) {
    const cap = await earn.caps(highYield.address);
    const headroom = cap - highYield.allocation;
    
    if (headroom > MIN_REALLOCATION) {
      // Find lower-yield strategy to pull from
      const lowYield = byApy[byApy.length - 1];
      const moveAmount = min(headroom, lowYield.liquidity);
      
      if (moveAmount > MIN_REALLOCATION) {
        // Reallocate: reduce low yield, increase high yield
        const allocations = [
          { id: lowYield.address, assets: lowYield.allocation - moveAmount },
          { id: highYield.address, assets: type(uint256).max },
        ];
        await earn.write.reallocate([allocations]);
      }
    }
  }
}
```

Key considerations:

- Only allocators/curators/owner can reallocate

- Respect strategy liquidity when withdrawing

- Cap increases are timelocked; decreases are instant

- Monitor strategy APYs and adjust allocations

- Keep some allocation in liquid/idle vault for withdrawals

See also: [Lens Contracts](tools-lens) - EulerEarnVaultLens provides `getVaultInfoFull()` to query all strategies and their allocations.

Reference: [https://github.com/euler-xyz/euler-earn#roles](https://github.com/euler-xyz/euler-earn#roles)

---

## 11. EulerSwap

**Impact: MEDIUM**

Automated market maker integrated with Euler credit vaults for deeper liquidity. Enables just-in-time liquidity from lending positions, providing up to 40x deeper markets than traditional AMMs.

### 11.1 Check EulerSwap Liquidity Limits

**Impact: MEDIUM (Understand available swap capacity)**

EulerSwap pools have directional liquidity limits based on the underlying Euler vault positions. Understanding these limits is crucial for executing large swaps successfully.

**Incorrect: assuming unlimited liquidity**

```solidity
// EulerSwap pools have finite, directional limits
// Unlike AMMs, liquidity comes from lending positions
pool.swap(1_000_000e18, 0, recipient, "");
// May fail if exceeds pool's borrowing capacity
```

**Correct: check limits before swapping**

```solidity
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

// getLimits(tokenIn, tokenOut) returns two values:
// - inLimit: max tokenIn that can be sold
// - outLimit: max tokenOut that can be bought
(uint256 inLimit, uint256 outLimit) = IEulerSwap(pool).getLimits(tokenIn, tokenOut);

// Check if your swap is within limits
require(amountIn <= inLimit, "Exceeds input limit");
// Output will be checked by computeQuote

// For the reverse direction, call with swapped tokens:
(uint256 reverseInLimit, uint256 reverseOutLimit) = IEulerSwap(pool).getLimits(tokenOut, tokenIn);
```

**Correct: understanding limit factors**

```typescript
interface PoolLiquidity {
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  limits: {
    inLimit: bigint;   // max tokenIn that can be sold
    outLimit: bigint;  // max tokenOut that can be bought
  };
  factors: {
    vaultCash: bigint;
    borrowCap: bigint;
    supplyCap: bigint;
    utilization: number;
  };
}

async function analyzeLiquidity(pool: Address, tokenIn: Address, tokenOut: Address): Promise<PoolLiquidity> {
  // getLimits takes tokenIn and tokenOut addresses
  const [inLimit, outLimit] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getLimits',
    args: [tokenIn, tokenOut],
  });
  
  // Limits depend on:
  // 1. Available cash in lending vaults (for output)
  // 2. Remaining borrow capacity (for borrowing output)
  // 3. Supply caps (for depositing input as collateral)
  // 4. Current utilization of vaults
  
  const vault0 = await pool.vault0();
  const vault1 = await pool.vault1();
  
  // Get static params for vault info
  const staticParams = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getStaticParams',
  });
  
  const vault0Info = await vaultLens.getVaultInfoDynamic(staticParams.supplyVault0);
  
  return {
    pool,
    tokenIn,
    tokenOut,
    limits: {
      inLimit,   // max tokenIn that can be sold
      outLimit,  // max tokenOut that can be bought
    },
    factors: {
      vaultCash: vault0Info.totalCash,
      borrowCap: vault0Info.borrowCap,
      supplyCap: vault0Info.supplyCap,
      utilization: vault0Info.totalBorrowed / vault0Info.totalAssets,
    },
  };
}
```

**Correct: splitting large swaps**

```solidity
// If swap exceeds limits, split into multiple smaller swaps
function splitSwap(
    address pool,
    uint256 totalAmountIn,
    address tokenIn,
    address tokenOut,
    uint256 minTotalOut
) external returns (uint256 totalOut) {
    (address asset0,) = IEulerSwap(pool).getAssets();
    bool sellingToken0 = tokenIn == asset0;
    
    uint256 remaining = totalAmountIn;
    
    while (remaining > 0) {
        // Check current limits - getLimits(tokenIn, tokenOut)
        (uint256 inLimit,) = IEulerSwap(pool).getLimits(tokenIn, tokenOut);
        
        if (inLimit == 0) {
            // Pool at capacity - wait or use different pool
            break;
        }
        
        uint256 swapAmount = remaining > inLimit ? inLimit : remaining;
        
        // Get quote and execute swap
        uint256 out = IEulerSwap(pool).computeQuote(tokenIn, tokenOut, swapAmount, true);
        IERC20(tokenIn).transfer(pool, swapAmount);
        IEulerSwap(pool).swap(
            sellingToken0 ? 0 : out,
            sellingToken0 ? out : 0,
            address(this),
            ""
        );
        
        totalOut += out;
        remaining -= swapAmount;
        
        // Note: In practice, limits may not refresh within same tx
        // This pattern works better across blocks
    }
    
    require(totalOut >= minTotalOut, "Insufficient output");
}
```

**Correct: monitoring pool health**

```typescript
async function isPoolHealthy(
  pool: Address,
  token0: Address,
  token1: Address
): Promise<boolean> {
  // Check if pool can fulfill swaps in both directions
  // getLimits(tokenIn, tokenOut) returns (inLimit, outLimit)
  const [limit0To1In, limit0To1Out] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getLimits',
    args: [token0, token1],
  });
  
  const [limit1To0In, limit1To0Out] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getLimits',
    args: [token1, token0],
  });
  
  // Pool should have meaningful limits in both directions
  const MIN_MEANINGFUL_LIMIT = 1000n * 10n ** 18n; // $1000 worth
  
  const hasForwardLiquidity = limit0To1In > MIN_MEANINGFUL_LIMIT;
  const hasReverseLiquidity = limit1To0In > MIN_MEANINGFUL_LIMIT;
  
  // Check pool is registered and not abandoned
  const isRegistered = await registry.isRegistered(pool);
  
  return hasForwardLiquidity && hasReverseLiquidity && isRegistered;
}

// Find pools with best liquidity for your swap size
async function findLiquidPools(
  tokenIn: Address,
  tokenOut: Address,
  requiredAmount: bigint
): Promise<Address[]> {
  const allPools = await registry.getPools(tokenIn, tokenOut);
  
  const liquidPools = await Promise.all(
    allPools.map(async (pool) => {
      const [inLimit,] = await publicClient.readContract({
        address: pool,
        abi: eulerSwapABI,
        functionName: 'getLimits',
        args: [tokenIn, tokenOut],
      });
      return inLimit >= requiredAmount ? pool : null;
    })
  );
  
  return liquidPools.filter((p): p is Address => p !== null);
}
```

Key concepts:

- getLimits(tokenIn, tokenOut) returns (inLimit, outLimit) for that specific direction

- Call getLimits twice with swapped arguments to check both directions

- Large swaps may need splitting across pools or time

- Pool registry tracks active, maintained pools

- Abandoned pools may have zero limits despite appearing active

Reference: [https://github.com/euler-xyz/euler-swap#liquidity](https://github.com/euler-xyz/euler-swap#liquidity)

### 11.2 Execute Swaps on EulerSwap

**Impact: MEDIUM (Token swaps via Euler liquidity)**

EulerSwap pools provide a Uniswap V2-compatible interface for executing swaps. Liquidity comes from Euler lending vaults, enabling deeper markets than traditional AMMs.

**Incorrect: swap without checking limits**

```solidity
// Large swaps may exceed pool liquidity limits
pool.swap(hugeAmount, 0, recipient, "");
// Reverts if amount exceeds getLimits()
```

**Correct: basic swap execution**

```solidity
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

// Step 1: Get quote and check limits
// computeQuote(tokenIn, tokenOut, amount, exactIn)
uint256 amountOut = IEulerSwap(pool).computeQuote(tokenIn, tokenOut, amountIn, true);
uint256 minOut = amountOut * 995 / 1000; // 0.5% slippage

// Step 2: Transfer input tokens to pool
IERC20(tokenIn).transfer(pool, amountIn);

// Step 3: Execute swap (Uniswap V2 style)
// amount0Out and amount1Out - one is your output, other is 0
(address asset0,) = IEulerSwap(pool).getAssets();
bool tokenInIsToken0 = tokenIn == asset0;

IEulerSwap(pool).swap(
    tokenInIsToken0 ? 0 : minOut,       // amount0Out
    tokenInIsToken0 ? minOut : 0,        // amount1Out
    recipient,                            // to
    ""                                    // data (empty for simple swap)
);
```

**Correct: using EulerSwapPeriphery for safety**

```solidity
import {IEulerSwapPeriphery} from "euler-swap/interfaces/IEulerSwapPeriphery.sol";

// Periphery handles token transfers and slippage checks

// Exact input swap
IERC20(tokenIn).approve(periphery, amountIn);

uint256 amountOut = IEulerSwapPeriphery(periphery).swapExactIn(
    pool,
    amountIn,
    minAmountOut,     // Slippage protection
    tokenIn,
    recipient,
    deadline          // Transaction deadline
);

// Exact output swap
IERC20(tokenIn).approve(periphery, maxAmountIn);

uint256 amountIn = IEulerSwapPeriphery(periphery).swapExactOut(
    pool,
    amountOut,        // Exact amount to receive
    maxAmountIn,      // Max willing to pay
    tokenIn,
    recipient,
    deadline
);
```

**Correct: TypeScript swap execution**

```typescript
import { encodeFunctionData } from 'viem';

async function executeSwap(
  pool: Address,
  tokenIn: Address,
  amountIn: bigint,
  minAmountOut: bigint,
  recipient: Address
) {
  // Use getAssets() to get token addresses
  const [asset0, asset1] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getAssets',
  });
  
  const tokenInIsToken0 = tokenIn.toLowerCase() === asset0.toLowerCase();
  
  // Approve and transfer in one tx via EVC batch
  const batchItems = [
    // Transfer tokens to pool
    {
      onBehalfOfAccount: sender,
      targetContract: tokenIn,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20ABI,
        functionName: 'transfer',
        args: [pool, amountIn],
      }),
    },
    // Execute swap
    {
      onBehalfOfAccount: sender,
      targetContract: pool,
      value: 0n,
      data: encodeFunctionData({
        abi: eulerSwapABI,
        functionName: 'swap',
        args: [
          tokenInIsToken0 ? 0n : minAmountOut,
          tokenInIsToken0 ? minAmountOut : 0n,
          recipient,
          '0x',
        ],
      }),
    },
  ];
  
  return await evc.write.batch([batchItems]);
}
```

**Correct: flash swap with callback**

```solidity
// Flash swaps: receive tokens first, pay in callback
contract FlashSwapper {
    function executeFlashSwap(
        address pool,
        uint256 amount0Out,
        uint256 amount1Out,
        bytes calldata data
    ) external {
        // Request tokens without paying upfront
        IEulerSwap(pool).swap(amount0Out, amount1Out, address(this), data);
    }
    
    // Callback from pool
    function eulerSwapCall(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external {
        // We've received the output tokens
        // Now we must pay the input tokens
        
        address pool = msg.sender;
        (address token0, address token1) = IEulerSwap(pool).getAssets();
        
        // Calculate required input (with fee)
        // computeQuote(tokenIn, tokenOut, amount, exactIn)
        address tokenIn = amount0 > 0 ? token1 : token0;
        address tokenOut = amount0 > 0 ? token0 : token1;
        uint256 amountIn = IEulerSwap(pool).computeQuote(
            tokenIn,
            tokenOut,
            amount0 > 0 ? amount0 : amount1,
            false // exact output
        );
        
        // Do something with received tokens (arbitrage, etc.)
        // ...
        
        // Pay back input tokens
        IERC20(tokenIn).transfer(pool, amountIn);
    }
}
```

**Correct: multi-hop swap via aggregator**

```typescript
// For routes through multiple pools
async function multiHopSwap(
  route: Address[], // [tokenA, pool1, tokenB, pool2, tokenC]
  amountIn: bigint,
  minFinalOut: bigint
) {
  let currentAmount = amountIn;
  
  for (let i = 0; i < route.length - 1; i += 2) {
    const tokenIn = route[i];
    const pool = route[i + 1];
    const tokenOut = route[i + 2];
    
    // Quote this hop
    const [hopOut] = await IEulerSwap(pool).computeQuote(currentAmount, true);
    
    // Execute hop
    await executeSwap(pool, tokenIn, currentAmount, hopOut * 99n / 100n, sender);
    
    currentAmount = hopOut;
  }
  
  require(currentAmount >= minFinalOut, 'Insufficient output');
}
```

Key points:

- Transfer input tokens to pool before calling swap

- Use periphery for simpler interface with built-in safety

- Flash swaps available via callback mechanism

- Check limits with `getLimits()` for large swaps

- Always use slippage protection and deadlines

Reference: [https://github.com/euler-xyz/euler-swap#for-solvers](https://github.com/euler-xyz/euler-swap#for-solvers)

### 11.3 Get Swap Quotes from EulerSwap

**Impact: MEDIUM (Price discovery for swap execution)**

EulerSwap provides deep liquidity by borrowing output tokens against input tokens via Euler credit vaults. Use `computeQuote` to get exact prices before executing swaps.

**Incorrect: using old quote for execution**

```solidity
// Quotes can change between blocks!
uint256 quote = pool.computeQuote(amountIn, true);
// ... time passes, other transactions happen ...
pool.swap(amountIn, quote, recipient, "");
// May revert if price moved - quote is stale
```

**Correct: query and execute atomically**

```solidity
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

// Get quote for exact input swap
// computeQuote(tokenIn, tokenOut, amount, exactIn) returns amountOut
uint256 amountOut = IEulerSwap(pool).computeQuote(
    tokenIn,           // Input token address
    tokenOut,          // Output token address
    amountIn,          // Amount of input token
    true               // Exact input (vs exact output)
);

// Apply slippage tolerance
uint256 minAmountOut = amountOut * 995 / 1000; // 0.5% slippage

// Transfer tokens to pool first (Uniswap V2 style)
IERC20(tokenIn).transfer(pool, amountIn);

// Execute swap - specify amounts OUT (Uniswap V2 interface)
// swap(amount0Out, amount1Out, to, data)
bool tokenOutIsToken0 = tokenOut == IEulerSwap(pool).token0();
IEulerSwap(pool).swap(
    tokenOutIsToken0 ? minAmountOut : 0,
    tokenOutIsToken0 ? 0 : minAmountOut,
    recipient,
    ""
);
```

**Correct: exact output quote**

```solidity
// For exact output: "I want exactly X tokens out"

// Get quote: how much input needed for desired output?
// computeQuote(tokenIn, tokenOut, amount, exactIn)
uint256 amountIn = IEulerSwap(pool).computeQuote(
    tokenIn,            // Input token address
    tokenOut,           // Output token address
    desiredAmountOut,   // Exact amount you want to receive
    false               // Exact output mode (false = exact output)
);

// Apply slippage tolerance (allow paying slightly more)
uint256 maxAmountIn = amountIn * 1005 / 1000; // 0.5% slippage

// Transfer input tokens first
IERC20(tokenIn).transfer(pool, maxAmountIn);

// Execute swap (Uniswap V2 style interface)
pool.swap(
    tokenOutIsToken0 ? desiredAmountOut : 0,
    tokenOutIsToken0 ? 0 : desiredAmountOut,
    recipient,
    ""
);
```

**Correct: using EulerSwapPeriphery**

```typescript
import { EulerSwapPeriphery } from '@eulerxyz/euler-swap';

// Periphery provides simpler interface with built-in protections

// Quote exact input
const quoteExactIn = await periphery.quoteExactInput(
  pool,
  amountIn,
  tokenIn === token0
);

console.log(`${amountIn} tokenIn -> ${quoteExactIn} tokenOut`);

// Quote exact output  
const quoteExactOut = await periphery.quoteExactOutput(
  pool,
  amountOut,
  tokenIn === token0
);

console.log(`${quoteExactOut} tokenIn needed for ${amountOut} tokenOut`);
```

**Correct: checking quote validity**

```solidity
// computeQuote reverts if:
// 1. Insufficient liquidity
// 2. Pool is decommissioned
// 3. Amount exceeds pool limits

function safeQuote(
    address pool,
    address tokenIn,
    address tokenOut,
    uint256 amount,
    bool exactIn
) public view returns (uint256 quote, bool valid) {
    try IEulerSwap(pool).computeQuote(tokenIn, tokenOut, amount, exactIn) 
        returns (uint256 result) 
    {
        return (result, true);
    } catch {
        return (0, false);
    }
}

// Check limits before quoting
(uint256 limit0In, uint256 limit1In, uint256 limit0Out, uint256 limit1Out) = 
    IEulerSwap(pool).getLimits();

// Ensure your swap is within limits
require(amountIn <= (tokenInIsToken0 ? limit0In : limit1In), "Exceeds input limit");
```

**Correct: comparing across pools**

```typescript
interface SwapRoute {
  pool: Address;
  amountOut: bigint;
  priceImpact: number;
}

async function findBestRoute(
  pools: Address[],
  amountIn: bigint,
  tokenIn: Address
): Promise<SwapRoute | null> {
  const quotes = await Promise.all(
    pools.map(async (pool) => {
      try {
        const token0 = await IEulerSwap(pool).token0();
        const tokenInIsToken0 = tokenIn === token0;
        
        const [amountOut] = await IEulerSwap(pool).computeQuote(
          amountIn,
          true // exact input
        );
        
        // Calculate price impact
        const spotPrice = await getSpotPrice(pool);
        const executionPrice = amountOut * 1e18 / amountIn;
        const priceImpact = (spotPrice - executionPrice) / spotPrice;
        
        return { pool, amountOut, priceImpact };
      } catch {
        return null;
      }
    })
  );
  
  // Filter failed quotes and sort by best output
  return quotes
    .filter((q): q is SwapRoute => q !== null)
    .sort((a, b) => Number(b.amountOut - a.amountOut))[0];
}
```

Key points:

- Always quote and execute atomically (same tx)

- Use slippage tolerance to handle price movement

- Check `getLimits()` before large swaps

- Quote reverts if insufficient liquidity

- Compare quotes across multiple pools for best price

Reference: [https://github.com/euler-xyz/euler-swap/blob/master/src/interfaces/IEulerSwap.sol](https://github.com/euler-xyz/euler-swap/blob/master/src/interfaces/IEulerSwap.sol)

---

## References

1. [https://docs.euler.finance](https://docs.euler.finance)
2. [https://github.com/euler-xyz/euler-vault-kit](https://github.com/euler-xyz/euler-vault-kit)
3. [https://github.com/euler-xyz/ethereum-vault-connector](https://github.com/euler-xyz/ethereum-vault-connector)
4. [https://github.com/euler-xyz/euler-price-oracle](https://github.com/euler-xyz/euler-price-oracle)
5. [https://github.com/euler-xyz/euler-earn](https://github.com/euler-xyz/euler-earn)
6. [https://github.com/euler-xyz/euler-swap](https://github.com/euler-xyz/euler-swap)
7. [https://github.com/euler-xyz/evk-periphery](https://github.com/euler-xyz/evk-periphery)
