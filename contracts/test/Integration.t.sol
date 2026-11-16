// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test, Vm } from "forge-std/Test.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPayable } from "reactive-lib/interfaces/IPayable.sol";
import { IReactive } from "reactive-lib/interfaces/IReactive.sol";
import { AuctionEscrow } from "../src/AuctionEscrow.sol";
import { PaymentVault } from "../src/PaymentVault.sol";
import { MockToken } from "../src/MockToken.sol";
import { ReactiveCoordinator } from "../src/ReactiveCoordinator.sol";
import { MockSystem } from "./ReactiveCoordinator.t.sol";

contract IntegrationNFT is ERC721 {
    constructor(address to) ERC721("N", "N") {
        _mint(to, 1);
    }
}

/// @notice Feeds real logs through the coordinator and delivers its callbacks to the real contracts,
/// so a signature or encoding mismatch between them fails here. All chains are simulated on one EVM.
contract IntegrationTest is Test {
    address internal constant SYSTEM = 0x8888888888888888888888888888888888888888;
    uint256 internal constant BASE = 84532;
    uint256 internal constant UNI = 1301;

    address internal proxy = makeAddr("proxy");
    address internal seller = makeAddr("seller");
    address internal sellerUniPayout = makeAddr("sellerUniPayout");
    address internal alice = makeAddr("alice"); // buys from Unichain
    address internal bob = makeAddr("bob"); // buys from Base

    AuctionEscrow internal escrow;
    PaymentVault internal vaultBase;
    PaymentVault internal vaultUni;
    MockToken internal tokenBase;
    MockToken internal tokenUni;
    IntegrationNFT internal nft;
    ReactiveCoordinator internal rc;
    MockSystem internal sys = MockSystem(SYSTEM);

    bytes32 internal cid;
    uint256 internal t0 = 1_000_000;
    uint256 internal delivered;
    uint256 internal txCounter;

    function setUp() public {
        vm.warp(t0);
        vm.etch(SYSTEM, address(new MockSystem()).code);

        // The coordinator is deployed last; the callback targets must trust its (precomputed) address.
        address rcAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 6);

        nft = new IntegrationNFT(seller);
        tokenBase = new MockToken();
        tokenUni = new MockToken();
        escrow = new AuctionEscrow(IPayable(payable(proxy)), rcAddr);
        vaultBase = new PaymentVault(IPayable(payable(proxy)), rcAddr, IERC20(address(tokenBase)));
        vaultUni = new PaymentVault(IPayable(payable(proxy)), rcAddr, IERC20(address(tokenUni)));

        uint256[] memory chains = new uint256[](2);
        chains[0] = BASE;
        chains[1] = UNI;
        address[] memory vaults = new address[](2);
        vaults[0] = address(vaultBase);
        vaults[1] = address(vaultUni);
        rc = new ReactiveCoordinator(BASE, address(escrow), chains, vaults);
        assertEq(address(rc), rcAddr);

        // Seller creates the campaign: 1000 -> 500, -50 / 10s, 100s long. Paid on Base to seller, on Unichain to a second address.
        uint256[] memory ec = new uint256[](2);
        ec[0] = BASE;
        ec[1] = UNI;
        address[] memory pays = new address[](2);
        pays[0] = seller;
        pays[1] = sellerUniPayout;
        address[] memory toks = new address[](2);
        toks[0] = address(tokenBase);
        toks[1] = address(tokenUni);
        vm.chainId(BASE);
        vm.startPrank(seller);
        nft.approve(address(escrow), 1);
        cid = escrow.createCampaign(AuctionEscrow.Params(address(nft), 1, 100, 1000, 500, 50, 10), ec, pays, toks);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- helpers

    function _deposit(PaymentVault v, MockToken t, uint256 chain, address who, uint256 amt) internal {
        vm.chainId(chain);
        vm.startPrank(who);
        t.faucet(amt);
        t.approve(address(v), amt);
        v.deposit(amt);
        vm.stopPrank();
    }

    function _intent(PaymentVault v, uint256 chain, address who, uint256 lock) internal {
        vm.chainId(chain);
        vm.prank(who);
        v.submitIntent(cid, lock);
    }

    function _isWatched(address emitter) internal view returns (bool) {
        return emitter == address(vaultBase) || emitter == address(vaultUni) || emitter == address(escrow);
    }

    function _chainOf(address emitter) internal view returns (uint256) {
        return emitter == address(vaultUni) ? UNI : BASE;
    }

    /// @dev Relay recorded logs to the coordinator, deliver its callbacks, repeat until quiet.
    function _pump() internal {
        for (uint256 round; round < 10; ++round) {
            Vm.Log[] memory logs = vm.getRecordedLogs();
            uint256 before = sys.count();
            for (uint256 i; i < logs.length; ++i) {
                if (!_isWatched(logs[i].emitter) || logs[i].topics.length == 0) continue;
                IReactive.LogRecord memory rec = IReactive.LogRecord({
                    chainId: _chainOf(logs[i].emitter),
                    contractAddress: logs[i].emitter,
                    topic0: uint256(logs[i].topics[0]),
                    topic1: logs[i].topics.length > 1 ? uint256(logs[i].topics[1]) : 0,
                    topic2: logs[i].topics.length > 2 ? uint256(logs[i].topics[2]) : 0,
                    topic3: logs[i].topics.length > 3 ? uint256(logs[i].topics[3]) : 0,
                    data: logs[i].data,
                    blockNumber: block.number,
                    opCode: logs[i].topics.length,
                    blockHash: 0,
                    txHash: ++txCounter,
                    logIndex: i
                });
                vm.prank(SYSTEM);
                rc.react(rec);
            }
            if (sys.count() == before && delivered == sys.count()) return;

            vm.recordLogs();
            while (delivered < sys.count()) {
                MockSystem.Cb memory cb = sys.get(delivered++);
                bytes memory p = cb.payload;
                address injected = address(rc); // the proxy overwrites the first argument
                assembly {
                    mstore(add(p, 36), injected)
                }
                vm.chainId(cb.chainId);
                vm.warp(block.timestamp + 3); // simulated relay latency
                vm.prank(proxy);
                (bool ok,) = cb.recipient.call{ gas: cb.gasLimit }(p);
                assertTrue(ok, "callback reverted");
            }
        }
        revert("pump did not settle");
    }

    // ------------------------------------------------------------------ tests

    function test_escrowHoldsNft() public view {
        assertEq(nft.ownerOf(1), address(escrow));
    }

    function test_unichainBuyerWins_baseBuyerLoses_sellerPaidOnUnichain() public {
        _deposit(vaultUni, tokenUni, UNI, alice, 1000e6);
        _deposit(vaultBase, tokenBase, BASE, bob, 1000e6);

        // Prices are in token base units: use a campaign priced in the same scale as the locks.
        // The campaign above is priced 1000 -> 500 raw units, so lock a small amount covering it.
        vm.recordLogs();
        vm.warp(t0 + 40); // price at intent time: 800
        _intent(vaultUni, UNI, alice, 900);
        vm.warp(t0 + 41);
        _intent(vaultBase, BASE, bob, 900);
        _pump();

        // One winner, one NFT transfer.
        assertEq(nft.ownerOf(1), alice);

        // Seller paid on the winner's chain at the intent-time price (800), and Alice got the remainder back.
        assertEq(tokenUni.balanceOf(sellerUniPayout), 800);
        assertEq(vaultUni.balance(alice), 1000e6 - 900 + 100);
        assertEq(tokenBase.balanceOf(seller), 0);

        // Bob's intent was rejected as inactive and released by Reactive; his funds are whole again.
        assertEq(vaultBase.balance(bob), 1000e6);

        // Vault solvency on both chains.
        assertEq(tokenUni.balanceOf(address(vaultUni)), vaultUni.balance(alice));
        assertEq(tokenBase.balanceOf(address(vaultBase)), vaultBase.balance(bob));
    }

    function test_unfundedEarlyIntentDoesNotBlockLaterOne() public {
        _deposit(vaultUni, tokenUni, UNI, alice, 1000e6);
        _deposit(vaultBase, tokenBase, BASE, bob, 1000e6);

        vm.recordLogs();
        vm.warp(t0 + 40); // price 800
        _intent(vaultUni, UNI, alice, 700); // underfunded
        vm.warp(t0 + 41);
        _intent(vaultBase, BASE, bob, 900);
        _pump();

        assertEq(nft.ownerOf(1), bob);
        assertEq(tokenBase.balanceOf(seller), 800); // paid on Base to the Base payout address
        assertEq(vaultUni.balance(alice), 1000e6); // alice's underfunded lock was released
    }

    function test_noWinner_reclaimFinalizesVaults() public {
        _deposit(vaultUni, tokenUni, UNI, alice, 1000e6);
        vm.recordLogs();
        _intent(vaultUni, UNI, alice, 10); // far below price, rejected
        _pump();
        assertEq(vaultUni.balance(alice), 1000e6);

        vm.chainId(BASE);
        vm.warp(t0 + 100 + 120 + 1 + 100);
        vm.prank(seller);
        escrow.reclaim(cid);
        _pump();
        assertEq(nft.ownerOf(1), seller);
        assertTrue(vaultUni.finalized(cid));
        assertTrue(vaultBase.finalized(cid));
    }
}
