# Euler Finance Agent Skill

**Version 1.0.0**  
Euler Labs  
January 2026

> **Note:**  
> This document is for agents and LLMs to follow when interacting with,  
> building on, or integrating Euler Finance protocol. It covers vault operations,  
> EVC batching, risk management, architecture, and security.
>
> For specialized topics, see companion skills:
> - `euler-irm-oracles` - Oracle adapters, price resolution, Interest Rate Models
> - `` - EulerSwap AMM integration
> - `euler-earn` - EulerEarn yield aggregation
> - `euler-advanced` - Hooks, flash loans, fee flow, rewards
> - `euler-data` - Lens contracts, subgraphs, developer tools

---

## Abstract

Core guide for interacting with Euler Finance V2 protocol. Covers vault operations (deposit, borrow, repay), EVC orchestration (batching, sub-accounts, operators), risk management (health factors, liquidation), architecture concepts (vault types, market design), interest rate models, security practices, and developer tools. For specialized topics, see companion skills: euler-irm-oracles, , euler-earn, euler-advanced.

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
4. [Architecture](#4-architecture) — **HIGH**
   - 4.1 [Understanding Euler Market Design](#41-understanding-euler-market-design)
   - 4.2 [Understanding Vault Types (Core, Edge, Escrow)](#42-understanding-vault-types-core-edge-escrow)
5. [Security](#5-security) — **CRITICAL**
   - 5.1 [Security and Audits](#51-security-and-audits)

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
// Using EulerKinkIRMFactory - kink is uint32 on type(uint32).max scale
address irm = EulerKinkIRMFactory(kinkIRMFactory).deploy(
    0,            // baseRate: 0% at 0 utilization
    1406417851,   // slope1: ~10% APY at kink (in SPY)
    19050045013,  // slope2: ~300% APY at 100% utilization (in SPY)
    3865470566    // kink: 90% utilization (type(uint32).max * 9 / 10)
);
// See irm-models rule for detailed IRM configuration

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
// AmountCap format: upper 10 bits mantissa + lower 6 bits exponent
// Formula: 10^exponent * mantissa / 100
// Encoding: (mantissa << 6) | exponent
//
// IMPORTANT: Caps are in raw token units - you MUST account for decimals!
//
// Special values:
//   - 0: NO CAP (unlimited) - uninitialized storage default
//   - 1: ZERO CAP (blocks all deposits/borrows) - mantissa=0, exp=1
//
// For 18-decimal tokens (ETH, DAI, etc.):
//   - 100 tokens = 100e18:  exp=20, mantissa=100 → (100 << 6) | 20 = 6420
//   - 1000 tokens = 1000e18: exp=21, mantissa=100 → (100 << 6) | 21 = 6421
//
// For 6-decimal tokens (USDC, USDT, etc.):
//   - 100 tokens = 100e6:   exp=8, mantissa=100 → (100 << 6) | 8 = 6408
//   - 1000 tokens = 1000e6: exp=9, mantissa=100 → (100 << 6) | 9 = 6409
//   - 1M tokens = 1e12:     exp=12, mantissa=100 → (100 << 6) | 12 = 6412
//
// For 8-decimal tokens (WBTC):
//   - 100 tokens = 100e8:   exp=10, mantissa=100 → (100 << 6) | 10 = 6410

// Example: 18-decimal token vault
vault.setCaps(
    6420,   // 100 tokens supply cap (100e18 for 18-decimal token)
    6419    // 10 tokens borrow cap (10e18 for 18-decimal token)
);

// Example: 6-decimal token vault (USDC)
// vault.setCaps(6412, 6411);  // 1M supply cap, 100k borrow cap

// Zero caps work the same for ANY token (6, 8, or 18 decimals):
// The value 1 always resolves to 0 (mantissa=0, exp=1 → 10^1 * 0 / 100 = 0)

vault.setCaps(0, 1);  // Disable borrowing: unlimited supply, zero borrow cap
vault.setCaps(1, 0);  // Disable deposits: zero supply cap, unlimited borrow  
vault.setCaps(1, 1);  // Disable both: zero supply cap, zero borrow cap

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

## 4. Architecture

**Impact: HIGH**

Core market design and vault architecture concepts. Understanding Euler's modular design - including vault types (Core, Edge, Escrow), market structure, and how components interact - is essential for building on Euler.

### 4.1 Understanding Euler Market Design

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

### 4.2 Understanding Vault Types (Core, Edge, Escrow)

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

## 5. Security

**Impact: CRITICAL**

Security practices, audit reports, and safety guidelines for Euler integrations. Understanding security considerations is essential for building safe applications on Euler.

### 5.1 Security and Audits

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

## References

1. [https://docs.euler.finance](https://docs.euler.finance)
2. [https://github.com/euler-xyz/euler-vault-kit](https://github.com/euler-xyz/euler-vault-kit)
3. [https://github.com/euler-xyz/ethereum-vault-connector](https://github.com/euler-xyz/ethereum-vault-connector)
4. [https://github.com/euler-xyz/evk-periphery](https://github.com/euler-xyz/evk-periphery)
