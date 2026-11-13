// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/Test.sol";
import { IPayable } from "reactive-lib/interfaces/IPayable.sol";
import { AbstractCallback } from "reactive-lib/base/AbstractCallback.sol";
import { AbstractPayer } from "reactive-lib/base/AbstractPayer.sol";
import { SpikeCallback } from "../../src/spike/SpikeCallback.sol";

contract SpikeCallbackTest is Test {
    address internal proxy = makeAddr("proxy");
    address internal reactive = makeAddr("reactive");
    SpikeCallback internal cb;

    event Pong(uint256 indexed id, uint256 srcChainId, uint256 originTs, uint256 callbackTs);

    function setUp() public {
        cb = new SpikeCallback(IPayable(payable(proxy)), reactive);
    }

    function test_pong_authorized() public {
        vm.expectEmit(true, false, false, true);
        emit Pong(1, 1301, 100, block.timestamp);
        vm.prank(proxy);
        cb.pong(reactive, 1, 1301, 100);
    }

    function test_pong_revertsIfNotProxy() public {
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), proxy));
        cb.pong(reactive, 1, 1301, 100);
    }

    function test_pong_revertsIfWrongReactiveSender() public {
        address other = makeAddr("other");
        vm.expectRevert(abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, other, reactive));
        vm.prank(proxy);
        cb.pong(other, 1, 1301, 100);
    }
}
