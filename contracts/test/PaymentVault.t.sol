// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPayable } from "reactive-lib/interfaces/IPayable.sol";
import { AbstractCallback } from "reactive-lib/base/AbstractCallback.sol";
import { AbstractPayer } from "reactive-lib/base/AbstractPayer.sol";
import { PaymentVault } from "../src/PaymentVault.sol";
import { MockToken } from "../src/MockToken.sol";

contract PaymentVaultTest is Test {
    address internal proxy = makeAddr("proxy");
    address internal rvm = makeAddr("rvm");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal payout = makeAddr("payout");
    bytes32 internal cid = keccak256("campaign");

    MockToken internal token;
    PaymentVault internal vault;

    function setUp() public {
        token = new MockToken();
        vault = new PaymentVault(IPayable(payable(proxy)), rvm, IERC20(address(token)));
        _fund(alice, 1000e6);
        _fund(bob, 1000e6);
    }

    function _fund(address who, uint256 amt) internal {
        vm.startPrank(who);
        token.faucet(amt);
        token.approve(address(vault), amt);
        vault.deposit(amt);
        vm.stopPrank();
    }

    function _intent(address who, uint256 lock) internal returns (bytes32 id) {
        vm.prank(who);
        id = vault.submitIntent(cid, lock);
    }

    function _finalize(bytes32 winner, uint256 chain, uint256 price) internal {
        vm.prank(proxy);
        vault.finalizeCampaign(rvm, cid, winner, chain, price, payout);
    }

    function test_deposit_withdraw() public {
        assertEq(vault.balance(alice), 1000e6);
        vm.prank(alice);
        vault.withdraw(400e6);
        assertEq(vault.balance(alice), 600e6);
        assertEq(token.balanceOf(alice), 400e6);
    }

    function test_withdraw_cannotTakeLockedFunds() public {
        _intent(alice, 800e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PaymentVault.InsufficientBalance.selector, 300e6, 200e6));
        vault.withdraw(300e6);
    }

    function test_submitIntent_locksFunds() public {
        bytes32 id = _intent(alice, 800e6);
        assertEq(vault.balance(alice), 200e6);
        (address buyer,, uint256 amount,, PaymentVault.Status st) = vault.intents(id);
        assertEq(buyer, alice);
        assertEq(amount, 800e6);
        assertEq(uint8(st), uint8(PaymentVault.Status.Locked));
    }

    function test_submitIntent_revertsIfOverBalance() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PaymentVault.InsufficientBalance.selector, 2000e6, 1000e6));
        vault.submitIntent(cid, 2000e6);
    }

    function test_finalize_winnerChain_paysSellerAndRefundsRemainder() public {
        bytes32 id = _intent(alice, 800e6);
        _finalize(id, block.chainid, 600e6);
        assertEq(token.balanceOf(payout), 600e6);
        assertEq(vault.balance(alice), 200e6 + 200e6); // untouched balance + remainder
        (,,,, PaymentVault.Status st) = vault.intents(id);
        assertEq(uint8(st), uint8(PaymentVault.Status.Paid));
    }

    function test_finalize_isIdempotent() public {
        bytes32 id = _intent(alice, 800e6);
        _finalize(id, block.chainid, 600e6);
        _finalize(id, block.chainid, 600e6);
        assertEq(token.balanceOf(payout), 600e6);
        assertEq(vault.balance(alice), 400e6);
    }

    function test_finalize_otherChain_marksFinalOnly() public {
        bytes32 id = _intent(alice, 800e6);
        _finalize(keccak256("remoteWinner"), block.chainid + 1, 600e6);
        assertTrue(vault.finalized(cid));
        assertEq(token.balanceOf(payout), 0);

        vault.unlock(id);
        assertEq(vault.balance(alice), 1000e6);
    }

    function test_unlock_revertsBeforeFinal() public {
        bytes32 id = _intent(alice, 800e6);
        vm.expectRevert(PaymentVault.NotFinal.selector);
        vault.unlock(id);
    }

    function test_unlock_winnerCannotUnlock() public {
        bytes32 id = _intent(alice, 800e6);
        // Winner is on another vault's chain label but same intent id would be in winnerIntentOf
        vm.prank(proxy);
        vault.finalizeCampaign(rvm, cid, id, block.chainid + 1, 600e6, payout);
        vm.expectRevert(PaymentVault.IsWinner.selector);
        vault.unlock(id);
    }

    function test_unlock_twiceReverts() public {
        bytes32 id = _intent(alice, 800e6);
        _finalize(bytes32(0), 0, 0); // no winner
        vault.unlock(id);
        vm.expectRevert(abi.encodeWithSelector(PaymentVault.NotLocked.selector, PaymentVault.Status.Unlocked));
        vault.unlock(id);
    }

    function test_release_unlocksRejectedIntent_andIsIdempotent() public {
        bytes32 id = _intent(alice, 800e6);
        vm.prank(proxy);
        vault.releaseIntent(rvm, id);
        assertEq(vault.balance(alice), 1000e6);
        vm.prank(proxy);
        vault.releaseIntent(rvm, id);
        assertEq(vault.balance(alice), 1000e6);
    }

    function test_unlockAfterTimeout() public {
        bytes32 id = _intent(alice, 800e6);
        vm.expectRevert(PaymentVault.LockActive.selector);
        vault.unlockAfterTimeout(id);
        vm.warp(block.timestamp + 7 days);
        vault.unlockAfterTimeout(id);
        assertEq(vault.balance(alice), 1000e6);
    }

    function test_callbacks_revertForUnauthorizedCallers() public {
        bytes32 id = _intent(alice, 800e6);
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), proxy));
        vault.releaseIntent(rvm, id);

        vm.prank(proxy);
        vm.expectRevert(abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, bob, rvm));
        vault.finalizeCampaign(bob, cid, id, block.chainid, 1, payout);
    }

    function test_vaultAlwaysSolvent_afterPaymentAndUnlocks() public {
        bytes32 a = _intent(alice, 800e6);
        bytes32 b = _intent(bob, 700e6);
        _finalize(a, block.chainid, 600e6);
        vault.unlock(b);
        uint256 owed = vault.balance(alice) + vault.balance(bob);
        assertEq(token.balanceOf(address(vault)), owed);
    }
}
