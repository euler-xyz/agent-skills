---
title: EUL Reward Token Distribution
impact: MEDIUM
impactDescription: Understanding locked reward mechanics and vesting
tags: rewards, eul, token, vesting, locked
---

## EUL Reward Token Distribution

RewardToken implements locked EUL distribution with a specific vesting schedule: 20% immediate unlock, 80% linear unlock over 6 months.

**Incorrect (expecting immediate full access to rewards):**

```solidity
// WRONG: Reward tokens are locked and vest over time
IERC20(rewardToken).transfer(recipient, amount); // May revert or lose tokens!
```

**Correct (understanding locked reward mechanics):**

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

**Correct (checking unlock amounts):**

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

**Correct (withdrawing vested tokens):**

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

```solidity
// The unlock share formula from RewardToken:
function calculateUnlockShare(uint256 lockTimestamp) public view returns (uint256) {
    uint256 SCALE = 1e18;
    uint256 LOCK_NORMALIZATION_FACTOR = 1 days;
    
    if (lockTimestamp > block.timestamp) return 0;
    
    uint256 timeElapsed = block.timestamp - lockTimestamp;
    
    // First day: 20% unlocked
    if (timeElapsed <= LOCK_NORMALIZATION_FACTOR) {
        return 0.2e18;
    }
    // After 180 days: 100% unlocked
    else if (timeElapsed >= 180 days) {
        return SCALE;
    }
    // Linear unlock of remaining 80% over 179 days
    else {
        return (timeElapsed - LOCK_NORMALIZATION_FACTOR) 
            * 0.8e18 
            / (180 days - LOCK_NORMALIZATION_FACTOR) 
            + 0.2e18;
    }
}
```

**TypeScript: Tracking reward vesting:**

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

**Key Points:**

1. **Transfers restricted**: Non-whitelisted accounts cannot transfer to each other
2. **Remainder receiver**: Unvested tokens go to DAO treasury when claimed early
3. **Lock normalization**: Locks are grouped by day for gas efficiency
4. **Whitelist roles**: ADMIN can freely move tokens, DISTRIBUTOR can distribute but not withdraw

Reference: [RewardToken.sol](https://github.com/euler-xyz/evk-periphery/blob/master/src/ERC20/deployed/RewardToken.sol)
