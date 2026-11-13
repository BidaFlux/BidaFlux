// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/Test.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IPayable } from "reactive-lib/interfaces/IPayable.sol";
import { AbstractCallback } from "reactive-lib/base/AbstractCallback.sol";
import { AbstractPayer } from "reactive-lib/base/AbstractPayer.sol";
import { AuctionEscrow } from "../src/AuctionEscrow.sol";

contract MockNFT is ERC721 {
    constructor() ERC721("Mock", "MCK") { }

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

contract AuctionEscrowTest is Test {
    uint256 internal constant BASE = 84532;
    uint256 internal constant UNI = 1301;
    uint256 internal constant GRACE = 120;

    address internal proxy = makeAddr("proxy");
    address internal rvm = makeAddr("rvm");
    address internal seller = makeAddr("seller");
    address internal sellerUniPayout = makeAddr("sellerUniPayout");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal tokenBase = makeAddr("tokenBase");
    address internal tokenUni = makeAddr("tokenUni");

    AuctionEscrow internal escrow;
    MockNFT internal nft;
    bytes32 internal cid;
    uint256 internal t0;

    event Settled(
        bytes32 indexed campaignId,
        bytes32 indexed intentId,
        address indexed buyer,
        uint256 srcChainId,
        uint256 price,
        address payout
    );
    event IntentRejected(bytes32 indexed campaignId, bytes32 indexed intentId, uint256 srcChainId, uint8 reason);
    event Reclaimed(bytes32 indexed campaignId);

    function setUp() public {
        vm.warp(1_000_000);
        t0 = block.timestamp;
        escrow = new AuctionEscrow(IPayable(payable(proxy)), rvm);
        nft = new MockNFT();
        nft.mint(seller, 1);

        uint256[] memory chains = new uint256[](2);
        chains[0] = BASE;
        chains[1] = UNI;
        address[] memory pays = new address[](2);
        pays[0] = seller;
        pays[1] = sellerUniPayout;
        address[] memory toks = new address[](2);
        toks[0] = tokenBase;
        toks[1] = tokenUni;

        // 1000 -> 500, -50 every 10s, 100s duration
        AuctionEscrow.Params memory p = AuctionEscrow.Params({
            nft: address(nft),
            tokenId: 1,
            duration: 100,
            startPrice: 1000,
            reservePrice: 500,
            decrement: 50,
            interval: 10
        });
        vm.startPrank(seller);
        nft.approve(address(escrow), 1);
        cid = escrow.createCampaign(p, chains, pays, toks);
        vm.stopPrank();
    }

    function _settle(bytes32 intentId, address buyer, uint256 chain, uint256 lock, uint256 ts) internal {
        vm.prank(proxy);
        escrow.settle(rvm, cid, intentId, buyer, chain, lock, ts);
    }

    // ------------------------------------------------------------ creation

    function test_create_escrowsNft() public view {
        assertEq(nft.ownerOf(1), address(escrow));
        (address s,,,,,,,,, AuctionEscrow.State st,,,,) = escrow.campaigns(cid);
        assertEq(s, seller);
        assertEq(uint8(st), uint8(AuctionEscrow.State.Active));
    }

    function test_create_revertsOnInvalidParams() public {
        nft.mint(seller, 2);
        uint256[] memory chains = new uint256[](1);
        chains[0] = BASE;
        address[] memory a = new address[](1);
        a[0] = seller;
        address[] memory t = new address[](1);
        t[0] = tokenBase;
        AuctionEscrow.Params memory p = AuctionEscrow.Params(address(nft), 2, 100, 400, 500, 50, 10); // start < reserve
        vm.startPrank(seller);
        nft.approve(address(escrow), 2);
        vm.expectRevert(AuctionEscrow.InvalidParams.selector);
        escrow.createCampaign(p, chains, a, t);
        vm.stopPrank();
    }

    function test_create_revertsOnDuplicateChain() public {
        nft.mint(seller, 2);
        uint256[] memory chains = new uint256[](2);
        chains[0] = BASE;
        chains[1] = BASE;
        address[] memory a = new address[](2);
        a[0] = seller;
        a[1] = seller;
        address[] memory t = new address[](2);
        t[0] = tokenBase;
        t[1] = tokenBase;
        AuctionEscrow.Params memory p = AuctionEscrow.Params(address(nft), 2, 100, 1000, 500, 50, 10);
        vm.startPrank(seller);
        nft.approve(address(escrow), 2);
        vm.expectRevert(AuctionEscrow.InvalidParams.selector);
        escrow.createCampaign(p, chains, a, t);
        vm.stopPrank();
    }

    // --------------------------------------------------------------- price

    function test_price_followsCurveAndFloorsAtReserve() public view {
        assertEq(escrow.priceAt(cid, t0), 1000);
        assertEq(escrow.priceAt(cid, t0 + 9), 1000);
        assertEq(escrow.priceAt(cid, t0 + 10), 950);
        assertEq(escrow.priceAt(cid, t0 + 80), 600);
        assertEq(escrow.priceAt(cid, t0 + 99), 550);
        assertEq(escrow.priceAt(cid, t0 + 100), 500);
        assertEq(escrow.priceAt(cid, t0 + 10_000), 500);
        assertEq(escrow.priceAt(cid, type(uint256).max), 500);
    }

    // -------------------------------------------------------------- settle

    function test_settle_happyPath_chargesIntentTimePrice() public {
        vm.warp(t0 + 48); // callback lands later than the intent
        uint256 intentTs = t0 + 40; // price 800
        vm.expectEmit(true, true, true, true);
        emit Settled(cid, bytes32("i1"), alice, UNI, 800, sellerUniPayout);
        _settle(bytes32("i1"), alice, UNI, 800, intentTs);

        assertEq(nft.ownerOf(1), alice);
        (,,,,,,,,, AuctionEscrow.State st, bytes32 wi, address w, uint256 wc, uint256 pr) = escrow.campaigns(cid);
        assertEq(uint8(st), uint8(AuctionEscrow.State.Settled));
        assertEq(wi, bytes32("i1"));
        assertEq(w, alice);
        assertEq(wc, UNI);
        assertEq(pr, 800);
    }

    function test_settle_secondIntentRejectedInactive() public {
        vm.warp(t0 + 5);
        _settle(bytes32("i1"), alice, BASE, 1000, t0 + 5);
        vm.expectEmit(true, true, false, true);
        emit IntentRejected(cid, bytes32("i2"), UNI, escrow.REJECT_INACTIVE());
        _settle(bytes32("i2"), bob, UNI, 1000, t0 + 5);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_settle_duplicateIntentRejected() public {
        vm.warp(t0 + 5);
        _settle(bytes32("i1"), alice, BASE, 100, t0 + 5); // underfunded, still marked seen
        vm.expectEmit(true, true, false, true);
        emit IntentRejected(cid, bytes32("i1"), BASE, escrow.REJECT_DUPLICATE());
        _settle(bytes32("i1"), alice, BASE, 1000, t0 + 5);
        assertEq(nft.ownerOf(1), address(escrow));
    }

    function test_settle_unfundedEarlyIntentDoesNotBlockLaterOne() public {
        vm.warp(t0 + 30); // price 850
        vm.expectEmit(true, true, false, true);
        emit IntentRejected(cid, bytes32("i1"), BASE, escrow.REJECT_UNDERFUNDED());
        _settle(bytes32("i1"), alice, BASE, 100, t0 + 30);
        _settle(bytes32("i2"), bob, UNI, 850, t0 + 30);
        assertEq(nft.ownerOf(1), bob);
    }

    function test_settle_staleRejected() public {
        vm.warp(t0 + 10 + GRACE + 1);
        vm.expectEmit(true, true, false, true);
        emit IntentRejected(cid, bytes32("i1"), BASE, escrow.REJECT_STALE());
        _settle(bytes32("i1"), alice, BASE, 1000, t0 + 10);
    }

    function test_settle_acceptedAtGraceBoundary() public {
        vm.warp(t0 + 10 + GRACE);
        _settle(bytes32("i1"), alice, BASE, 1000, t0 + 10);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_settle_timeWindowRejected() public {
        vm.warp(t0 + 100 + 50);
        vm.expectEmit(true, true, false, true);
        emit IntentRejected(cid, bytes32("late"), BASE, escrow.REJECT_TIME_WINDOW()); // after expiry
        _settle(bytes32("late"), alice, BASE, 1000, t0 + 101);

        vm.expectEmit(true, true, false, true);
        emit IntentRejected(cid, bytes32("future"), BASE, escrow.REJECT_TIME_WINDOW()); // after callback time
        _settle(bytes32("future"), alice, BASE, 1000, block.timestamp + 1);
    }

    function test_settle_chainDisabledRejected() public {
        vm.warp(t0 + 5);
        vm.expectEmit(true, true, false, true);
        emit IntentRejected(cid, bytes32("i1"), 999, escrow.REJECT_CHAIN_DISABLED());
        _settle(bytes32("i1"), alice, 999, 1000, t0 + 5);
    }

    function test_settle_unknownCampaignRejectedWithoutRevert() public {
        vm.warp(t0 + 5);
        bytes32 bogus = keccak256("bogus");
        vm.expectEmit(true, true, false, true);
        emit IntentRejected(bogus, bytes32("i1"), BASE, escrow.REJECT_INACTIVE());
        vm.prank(proxy);
        escrow.settle(rvm, bogus, bytes32("i1"), alice, BASE, 1000, t0 + 5);
    }

    function test_settle_revertsIfCallerNotProxy() public {
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), proxy));
        escrow.settle(rvm, cid, bytes32("i1"), alice, BASE, 1000, t0);
    }

    function test_settle_revertsIfWrongReactiveSender() public {
        address other = makeAddr("other");
        vm.prank(proxy);
        vm.expectRevert(abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, other, rvm));
        escrow.settle(other, cid, bytes32("i1"), alice, BASE, 1000, t0);
    }

    // ------------------------------------------------------ reclaim / replay

    function test_reclaim_onlyAfterExpiryPlusGrace() public {
        vm.warp(t0 + 100 + GRACE);
        vm.prank(seller);
        vm.expectRevert(AuctionEscrow.TooEarly.selector);
        escrow.reclaim(cid);

        vm.warp(t0 + 100 + GRACE + 1);
        vm.expectEmit(true, false, false, false);
        emit Reclaimed(cid);
        vm.prank(seller);
        escrow.reclaim(cid);
        assertEq(nft.ownerOf(1), seller);
    }

    function test_reclaim_onlySeller() public {
        vm.warp(t0 + 100 + GRACE + 1);
        vm.prank(alice);
        vm.expectRevert(AuctionEscrow.NotSeller.selector);
        escrow.reclaim(cid);
    }

    function test_reclaim_revertsAfterSettlement() public {
        vm.warp(t0 + 5);
        _settle(bytes32("i1"), alice, BASE, 1000, t0 + 5);
        vm.warp(t0 + 100 + GRACE + 1);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(AuctionEscrow.WrongState.selector, AuctionEscrow.State.Settled));
        escrow.reclaim(cid);
    }

    function test_settle_afterReclaimRejected() public {
        vm.warp(t0 + 100 + GRACE + 1);
        vm.prank(seller);
        escrow.reclaim(cid);
        vm.expectEmit(true, true, false, true);
        emit IntentRejected(cid, bytes32("i1"), BASE, escrow.REJECT_INACTIVE());
        _settle(bytes32("i1"), alice, BASE, 1000, t0 + 50);
        assertEq(nft.ownerOf(1), seller);
    }

    function test_replay_reemitsSettledOnly() public {
        vm.warp(t0 + 5);
        _settle(bytes32("i1"), alice, UNI, 1000, t0 + 5);
        vm.expectEmit(true, true, true, true);
        emit Settled(cid, bytes32("i1"), alice, UNI, 1000, sellerUniPayout);
        escrow.replaySettlement(cid);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_replay_revertsIfNotSettled() public {
        vm.expectRevert(abi.encodeWithSelector(AuctionEscrow.WrongState.selector, AuctionEscrow.State.Active));
        escrow.replaySettlement(cid);
    }
}
