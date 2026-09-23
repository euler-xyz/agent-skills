---
title: Use Sub-Accounts for Isolated Positions
impact: HIGH
impactDescription: Manage multiple isolated positions from one wallet
tags: evc, sub-accounts, isolation, positions, address
---

## Use Sub-Accounts for Isolated Positions

Sub-accounts allow a single Ethereum address to manage up to 256 isolated positions. Each sub-account can have different collateral/debt combinations with separate liquidation risk.

**Incorrect (using same account for multiple borrows):**

```solidity
// ERROR: Account can only have ONE controller at a time
IEVC(evc).enableController(account, borrowVaultA);
IEVC(evc).enableController(account, borrowVaultB);
// EVK rejects multiple enabled controllers during the final account status check.
```

**Correct (use sub-accounts for different borrows):**

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

**Correct (helper function for sub-account calculation):**

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

**Correct (rebalancing between sub-accounts in a batch):**

```typescript
// Move collateral between sub-accounts without needing approvals
const subAccount0 = getSubAccount(account, 0);
const subAccount1 = getSubAccount(account, 1);

const batchItems = [
  // Transfer vault shares from sub-account 0
  {
    onBehalfOfAccount: subAccount0,
    targetContract: collateralVault,
    value: 0n,
    data: encodeFunctionData({
      abi: eVaultABI,
      functionName: 'transfer',
      args: [subAccount1, sharesToMove],
    }),
  },
  // The receiver now owns vault shares; no underlying-token withdrawal occurs.
];

// Owner can operate on behalf of any sub-account
await evc.write.batch([batchItems]);
```

**Correct (checking sub-account ownership):**

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

Transfer shares between positions; send underlying-token withdrawals to the owner wallet. A synthetic sub-account address cannot sign an ERC-20 transfer. Enable collateral on the destination when needed, and ensure both positions pass the final health checks.

Key points:
- Sub-accounts share 19 bytes, differ in last byte (0-255)
- Owner can operate on all 256 sub-accounts without approval
- Each sub-account can have ONE controller (single liability)
- Collateral can be shared or isolated per sub-account
- Use different sub-accounts for different risk strategies

Reference: [EVC Whitepaper - Sub-Accounts](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md#sub-accounts)
