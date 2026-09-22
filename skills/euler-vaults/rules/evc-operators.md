---
title: Delegate Control via Operators
impact: HIGH
impactDescription: Preserve account authorization when delegating vault operations
tags: evc, operators, delegation, authorization
---

## Delegate Control via Operators

An EVC operator can act on behalf of the accounts that authorize it. EVC authenticates the operator contract; the contract must enforce its own caller and execution policy.

**Correct (authorize and revoke one account):**

```typescript
await evc.write.setAccountOperator([userAccount, operatorAddress, true]);
const authorized = await evc.read.isAccountOperatorAuthorized([
  userAccount, operatorAddress,
]);
await evc.write.setAccountOperator([userAccount, operatorAddress, false]);
```

**Correct (owner-controlled withdrawal operator):**

This example accepts calls only from the registered account owner, fixes the operation, and sends underlying assets to that owner. The owner must first authorize the deployed operator through EVC.

<!-- checked-solidity: owner-withdraw-operator -->
```solidity
import {IEVC} from "ethereum-vault-connector/interfaces/IEthereumVaultConnector.sol";
import {IERC4626} from "evk/EVault/IEVault.sol";

contract OwnerWithdrawOperator {
    IEVC public immutable evc;

    constructor(IEVC evc_) {
        evc = evc_;
    }

    function withdrawToOwner(address account, address vault, uint256 assets) external {
        require(msg.sender == evc.getAccountOwner(account), "Only account owner");

        IEVC.BatchItem[] memory items = new IEVC.BatchItem[](1);
        items[0] = IEVC.BatchItem({
            targetContract: vault,
            onBehalfOfAccount: account,
            value: 0,
            data: abi.encodeCall(IERC4626.withdraw, (assets, msg.sender, account))
        });
        evc.batch(items);
    }
}
```

A selector allowlist alone cannot secure permissionless automation: a permitted withdrawal can still specify an attacker's recipient. Keeper-triggered strategies need an owner-authorized policy covering the account, allowed targets, recipients, amounts, and trigger conditions. Do not expose arbitrary account/target/calldata forwarding.

Use exact asset amounts for `withdraw`. To redeem all shares, EVK supports `redeem(type(uint256).max, owner, account)`; health and cash constraints still apply. Send ordinary ERC20 assets to the owner wallet, since EVC virtual sub-accounts cannot sign ERC20 transfers.

Operators can be revoked by the owner. A controller checks collateral health and releases itself through its own `disableController()` flow after repayment.

Reference: [EVC operator authorization](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L758-L800)
