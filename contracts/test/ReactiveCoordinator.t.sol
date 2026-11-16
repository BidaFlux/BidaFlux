// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/Test.sol";
import { IReactive } from "reactive-lib/interfaces/IReactive.sol";
import { ReactiveCoordinator } from "../src/ReactiveCoordinator.sol";

/// @dev Stands in for the Lasna system contract: records subscriptions and callback requests.
contract MockSystem {
    struct Cb {
        uint256 chainId;
        address recipient;
        uint64 gasLimit;
        bytes payload;
    }

    uint256 public subscriptions;
    Cb[] public callbacks;

    function subscribe(uint256, address, uint256, uint256, uint256, uint256) external {
        ++subscriptions;
    }

    struct Config {
        uint256 chainId;
        address recipient;
        uint64 gasLimit;
        bytes payload;
    }

    function requestCallbackV_1_0(Config memory c) external {
        callbacks.push(Cb(c.chainId, c.recipient, c.gasLimit, c.payload));
    }

    function count() external view returns (uint256) {
        return callbacks.length;
    }

    function get(uint256 i) external view returns (Cb memory) {
        return callbacks[i];
    }
}

contract ReactiveCoordinatorTest is Test {
    address internal constant SYSTEM = 0x8888888888888888888888888888888888888888;
    uint256 internal constant BASE = 84532;
    uint256 internal constant UNI = 1301;

    address internal escrow = makeAddr("escrow");
    address internal vaultBase = makeAddr("vaultBase");
    address internal vaultUni = makeAddr("vaultUni");
    address internal alice = makeAddr("alice");
    address internal payout = makeAddr("payout");
    bytes32 internal cid = keccak256("campaign");

    ReactiveCoordinator internal rc;
    MockSystem internal sys = MockSystem(SYSTEM);
    uint256 internal logNonce;

    function setUp() public {
        vm.etch(SYSTEM, address(new MockSystem()).code);
        uint256[] memory chains = new uint256[](2);
        chains[0] = BASE;
        chains[1] = UNI;
        address[] memory vaults = new address[](2);
        vaults[0] = vaultBase;
        vaults[1] = vaultUni;
        rc = new ReactiveCoordinator(BASE, escrow, chains, vaults);
    }

    function _log(uint256 chainId, address src, string memory sig, uint256 t1, uint256 t2, uint256 t3, bytes memory data)
        internal
        returns (IReactive.LogRecord memory)
    {
        return IReactive.LogRecord({
            chainId: chainId,
            contractAddress: src,
            topic0: uint256(keccak256(bytes(sig))),
            topic1: t1,
            topic2: t2,
            topic3: t3,
            data: data,
            blockNumber: 1,
            opCode: 4,
            blockHash: 1,
            txHash: ++logNonce,
            logIndex: 0
        });
    }

    function _react(IReactive.LogRecord memory l) internal {
        vm.prank(SYSTEM);
        rc.react(l);
    }

    function _intentLog(uint256 chain, address vault, bytes32 intentId) internal returns (IReactive.LogRecord memory) {
        return _log(
            chain,
            vault,
            "IntentSubmitted(bytes32,bytes32,address,uint256,uint256)",
            uint256(cid),
            uint256(intentId),
            uint256(uint160(alice)),
            abi.encode(uint256(800), uint256(12345))
        );
    }

    function test_constructor_subscribesToAllSources() public view {
        assertEq(sys.subscriptions(), 2 + 3); // two vaults + three escrow events
    }

    function test_react_onlySystem() public {
        IReactive.LogRecord memory l = _intentLog(UNI, vaultUni, bytes32("i1"));
        vm.expectRevert();
        rc.react(l);
    }

    function test_intent_relayedToEscrowOnce() public {
        IReactive.LogRecord memory l = _intentLog(UNI, vaultUni, bytes32("i1"));
        _react(l);
        _react(l); // same log delivered again
        assertEq(sys.count(), 1);

        MockSystem.Cb memory cb = sys.get(0);
        assertEq(cb.chainId, BASE);
        assertEq(cb.recipient, escrow);
        assertEq(cb.gasLimit, rc.HOP1_GAS_LIMIT());
        bytes memory expected = abi.encodeWithSignature(
            "settle(address,bytes32,bytes32,address,uint256,uint256,uint256)",
            address(0),
            cid,
            bytes32("i1"),
            alice,
            UNI,
            uint256(800),
            uint256(12345)
        );
        assertEq(cb.payload, expected);
    }

    function test_intent_fromUnknownSourceIgnored() public {
        _react(_intentLog(UNI, makeAddr("rogue"), bytes32("i1")));
        _react(_intentLog(999, vaultUni, bytes32("i1")));
        assertEq(sys.count(), 0);
    }

    function test_settled_finalizesEveryVault() public {
        _react(
            _log(
                BASE,
                escrow,
                "Settled(bytes32,bytes32,address,uint256,uint256,address)",
                uint256(cid),
                uint256(bytes32("i1")),
                uint256(uint160(alice)),
                abi.encode(UNI, uint256(800), payout)
            )
        );
        assertEq(sys.count(), 2);
        bytes memory expected = abi.encodeWithSignature(
            "finalizeCampaign(address,bytes32,bytes32,uint256,uint256,address)",
            address(0),
            cid,
            bytes32("i1"),
            UNI,
            uint256(800),
            payout
        );
        assertEq(sys.get(0).chainId, BASE);
        assertEq(sys.get(0).recipient, vaultBase);
        assertEq(sys.get(1).chainId, UNI);
        assertEq(sys.get(1).recipient, vaultUni);
        assertEq(sys.get(0).payload, expected);
        assertEq(sys.get(1).payload, expected);
    }

    function test_rejected_releasesOnSourceVault() public {
        _react(
            _log(
                BASE,
                escrow,
                "IntentRejected(bytes32,bytes32,uint256,uint8)",
                uint256(cid),
                uint256(bytes32("i1")),
                0,
                abi.encode(UNI, uint8(6))
            )
        );
        assertEq(sys.count(), 1);
        assertEq(sys.get(0).chainId, UNI);
        assertEq(sys.get(0).recipient, vaultUni);
        assertEq(sys.get(0).payload, abi.encodeWithSignature("releaseIntent(address,bytes32)", address(0), bytes32("i1")));
    }

    function test_rejected_duplicateIsNeverRelayed() public {
        _react(
            _log(
                BASE,
                escrow,
                "IntentRejected(bytes32,bytes32,uint256,uint8)",
                uint256(cid),
                uint256(bytes32("i1")),
                0,
                abi.encode(UNI, uint8(2))
            )
        );
        assertEq(sys.count(), 0);
    }

    function test_reclaimed_finalizesVaultsWithNoWinner() public {
        _react(_log(BASE, escrow, "Reclaimed(bytes32)", uint256(cid), 0, 0, ""));
        assertEq(sys.count(), 2);
        assertEq(
            sys.get(0).payload,
            abi.encodeWithSignature(
                "finalizeCampaign(address,bytes32,bytes32,uint256,uint256,address)",
                address(0),
                cid,
                bytes32(0),
                uint256(0),
                uint256(0),
                address(0)
            )
        );
    }

    function test_escrowEventsFromWrongChainOrAddressIgnored() public {
        bytes memory d = abi.encode(UNI, uint256(800), payout);
        string memory sig = "Settled(bytes32,bytes32,address,uint256,uint256,address)";
        _react(_log(UNI, escrow, sig, uint256(cid), 1, 1, d));
        _react(_log(BASE, makeAddr("rogue"), sig, uint256(cid), 1, 1, d));
        assertEq(sys.count(), 0);
    }
}
