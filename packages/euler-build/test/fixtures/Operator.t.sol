// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {OwnerWithdrawOperator} from '../src/OwnerWithdrawOperator.sol';
import {IEVC} from 'ethereum-vault-connector/interfaces/IEthereumVaultConnector.sol';
import {IERC4626} from 'evk/EVault/IEVault.sol';
contract MockEVC {
    address public owner;
    address public recipient;
    address public position;
    uint256 public amount;
    constructor(address owner_) { owner = owner_; }
    function getAccountOwner(address) external view returns (address) { return owner; }
    function batch(IEVC.BatchItem[] calldata items) external payable {
        require(items.length == 1);
        bytes calldata data = items[0].data;
        require(bytes4(data[:4]) == IERC4626.withdraw.selector);
        (amount, recipient, position) = abi.decode(data[4:], (uint256, address, address));
        require(items[0].onBehalfOfAccount == position);
    }
}
contract Outsider {
    function attempt(OwnerWithdrawOperator operator) external returns (bool success) {
        (success,) = address(operator).call(abi.encodeCall(operator.withdrawToOwner, (address(0x11), address(0x22), 100)));
    }
}
contract OperatorTest {
    function testOwnerRecipientAndAccountContext() public {
        MockEVC evc = new MockEVC(address(this));
        OwnerWithdrawOperator operator = new OwnerWithdrawOperator(IEVC(address(evc)));
        operator.withdrawToOwner(address(0x11), address(0x22), 100);
        require(evc.recipient() == address(this));
        require(evc.position() == address(0x11));
        require(evc.amount() == 100);
    }
    function testOutsiderCannotInvokeOwnerPolicy() public {
        MockEVC evc = new MockEVC(address(this));
        OwnerWithdrawOperator operator = new OwnerWithdrawOperator(IEVC(address(evc)));
        require(!new Outsider().attempt(operator));
        require(evc.amount() == 0);
    }
}
