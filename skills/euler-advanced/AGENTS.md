# Euler Advanced Features Agent Skill

**Version 1.0.0**  
Euler Labs  
January 2026

> **Note:**  
> This document is for agents and LLMs to follow when implementing  
> advanced Euler features. It covers hooks, flash loans, fee flow, and rewards.

---

## Abstract

Advanced features guide for Euler Finance V2 protocol. Covers vault hooks for custom logic, flash loans and debt transfer, fee flow controller mechanics, and EUL reward token distribution. For power users building sophisticated integrations.

---

## Table of Contents

1. [Advanced Features](#1-advanced-features) — **MEDIUM**
   - 1.1 [EUL Reward Token Distribution](#11-eul-reward-token-distribution)
   - 1.2 [Fee Flow Controller Mechanics](#12-fee-flow-controller-mechanics)
   - 1.3 [Flash Loans and Debt Transfer](#13-flash-loans-and-debt-transfer)
   - 1.4 [Vault Hooks and Use Cases](#14-vault-hooks-and-use-cases)

---

## 1. Advanced Features

**Impact: MEDIUM**

Advanced protocol features for power users and integrators. Covers vault hooks for custom logic, flash loans with pull-debt patterns, fee flow and revenue distribution, and EUL token rewards/staking. These features enable sophisticated DeFi strategies and protocol integrations.

### 1.1 EUL Reward Token Distribution

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

### 1.2 Fee Flow Controller Mechanics

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

### 1.3 Flash Loans and Debt Transfer

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

### 1.4 Vault Hooks and Use Cases

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

## References

1. [https://docs.euler.finance](https://docs.euler.finance)
2. [https://github.com/euler-xyz/euler-vault-kit](https://github.com/euler-xyz/euler-vault-kit)
3. [https://github.com/euler-xyz/evk-periphery](https://github.com/euler-xyz/evk-periphery)
