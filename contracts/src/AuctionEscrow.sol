// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AbstractCallback } from "reactive-lib/base/AbstractCallback.sol";
import { IPayable } from "reactive-lib/interfaces/IPayable.sol";

/// @title AuctionEscrow
/// @notice Canonical NFT escrow and Dutch auction for one NFT per campaign. Sole authority on who wins.
/// Winners are chosen by the first valid `settle` callback relayed by the reactive contract.
contract AuctionEscrow is AbstractCallback, ReentrancyGuard {
    enum State { None, Active, Settled, Reclaimed }

    /// @dev `IntentRejected.reason` codes.
    uint8 public constant REJECT_INACTIVE = 1;
    uint8 public constant REJECT_DUPLICATE = 2;
    uint8 public constant REJECT_TIME_WINDOW = 3;
    uint8 public constant REJECT_STALE = 4;
    uint8 public constant REJECT_CHAIN_DISABLED = 5;
    uint8 public constant REJECT_UNDERFUNDED = 6;

    /// @notice Max age of an intent when its callback arrives.
    uint256 public constant GRACE = 120;

    struct Campaign {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 start;
        uint256 expiry;
        uint256 startPrice;
        uint256 reservePrice;
        uint256 decrement;
        uint256 interval;
        State state;
        bytes32 winnerIntent;
        address winner;
        uint256 winnerChainId;
        uint256 price;
    }

    struct ChainPayout {
        address payout;
        address token;
    }

    struct Params {
        address nft;
        uint256 tokenId;
        uint256 duration;
        uint256 startPrice;
        uint256 reservePrice;
        uint256 decrement;
        uint256 interval;
    }

    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => mapping(uint256 => ChainPayout)) public payouts;
    mapping(bytes32 => mapping(bytes32 => bool)) public intentSeen;
    uint256 public campaignCount;

    event CampaignCreated(
        bytes32 indexed campaignId, address indexed seller, address nft, uint256 tokenId, uint256 start, uint256 expiry
    );
    event ChainEnabled(bytes32 indexed campaignId, uint256 indexed chainId, address payout, address token);
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

    error InvalidParams();
    error NotSeller();
    error WrongState(State state);
    error TooEarly();

    constructor(IPayable callbackProxy_, address reactive_) payable AbstractCallback(callbackProxy_, reactive_) { }

    // ---------------------------------------------------------------- seller

    /// @param chainIds Enabled source chains. `payoutAddrs[i]` and `tokens[i]` apply to `chainIds[i]`.
    function createCampaign(
        Params calldata p,
        uint256[] calldata chainIds,
        address[] calldata payoutAddrs,
        address[] calldata tokens
    ) external nonReentrant returns (bytes32 campaignId) {
        if (
            p.nft == address(0) || p.duration == 0 || p.interval == 0 || p.decrement == 0 || p.reservePrice == 0
                || p.startPrice < p.reservePrice || chainIds.length == 0 || chainIds.length != payoutAddrs.length
                || chainIds.length != tokens.length
        ) revert InvalidParams();

        campaignId = keccak256(abi.encode(address(this), ++campaignCount));
        Campaign storage c = campaigns[campaignId];
        c.seller = msg.sender;
        c.nft = p.nft;
        c.tokenId = p.tokenId;
        c.start = block.timestamp;
        c.expiry = block.timestamp + p.duration;
        c.startPrice = p.startPrice;
        c.reservePrice = p.reservePrice;
        c.decrement = p.decrement;
        c.interval = p.interval;
        c.state = State.Active;

        for (uint256 i; i < chainIds.length; ++i) {
            if (chainIds[i] == 0 || payoutAddrs[i] == address(0) || tokens[i] == address(0)) revert InvalidParams();
            if (payouts[campaignId][chainIds[i]].payout != address(0)) revert InvalidParams(); // duplicate chain
            payouts[campaignId][chainIds[i]] = ChainPayout(payoutAddrs[i], tokens[i]);
            emit ChainEnabled(campaignId, chainIds[i], payoutAddrs[i], tokens[i]);
        }

        IERC721(p.nft).transferFrom(msg.sender, address(this), p.tokenId);
        emit CampaignCreated(campaignId, msg.sender, p.nft, p.tokenId, c.start, c.expiry);
    }

    /// @notice Seller takes back an unsold NFT once no valid intent can still arrive.
    function reclaim(bytes32 campaignId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.seller != msg.sender) revert NotSeller();
        if (c.state != State.Active) revert WrongState(c.state);
        if (block.timestamp <= c.expiry + GRACE) revert TooEarly();

        c.state = State.Reclaimed;
        IERC721(c.nft).transferFrom(address(this), c.seller, c.tokenId);
        emit Reclaimed(campaignId);
    }

    // -------------------------------------------------------------- callbacks

    /// @notice Hop 1: relayed purchase intent. Invalid intents emit `IntentRejected` instead of reverting.
    /// @param rvm_ Injected by the callback proxy; must be the authorized reactive contract.
    function settle(
        address rvm_,
        bytes32 campaignId,
        bytes32 intentId,
        address buyer,
        uint256 srcChainId,
        uint256 lockAmount,
        uint256 intentTs
    ) external onlyServiceProvider onlyCallbackSender(rvm_) nonReentrant {
        Campaign storage c = campaigns[campaignId];
        ChainPayout memory cp = payouts[campaignId][srcChainId];

        uint8 reason;
        uint256 price;
        if (intentSeen[campaignId][intentId]) {
            reason = REJECT_DUPLICATE;
        } else if (c.state != State.Active) {
            reason = REJECT_INACTIVE;
        } else if (intentTs < c.start || intentTs > c.expiry || intentTs > block.timestamp) {
            reason = REJECT_TIME_WINDOW;
        } else if (block.timestamp > intentTs + GRACE) {
            reason = REJECT_STALE;
        } else if (cp.payout == address(0)) {
            reason = REJECT_CHAIN_DISABLED;
        } else {
            price = priceAt(campaignId, intentTs);
            if (lockAmount < price) reason = REJECT_UNDERFUNDED;
        }

        if (c.state != State.None) intentSeen[campaignId][intentId] = true;

        if (reason != 0) {
            emit IntentRejected(campaignId, intentId, srcChainId, reason);
            return;
        }

        c.state = State.Settled;
        c.winnerIntent = intentId;
        c.winner = buyer;
        c.winnerChainId = srcChainId;
        c.price = price;

        IERC721(c.nft).transferFrom(address(this), buyer, c.tokenId);
        emit Settled(campaignId, intentId, buyer, srcChainId, price, cp.payout);
    }

    /// @notice Re-emit `Settled` so the reactive contract relays hop 2 again. Permissionless; no state change.
    function replaySettlement(bytes32 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != State.Settled) revert WrongState(c.state);
        emit Settled(
            campaignId, c.winnerIntent, c.winner, c.winnerChainId, c.price, payouts[campaignId][c.winnerChainId].payout
        );
    }

    // ------------------------------------------------------------------ views

    /// @notice Dutch price at time `t`: max(reserve, start - decrement * floor((t - start) / interval)).
    function priceAt(bytes32 campaignId, uint256 t) public view returns (uint256) {
        Campaign storage c = campaigns[campaignId];
        if (c.state == State.None) revert WrongState(State.None);
        if (t <= c.start) return c.startPrice;
        uint256 steps = (t - c.start) / c.interval;
        uint256 range = c.startPrice - c.reservePrice;
        // Steps needed to bottom out; avoids overflow in steps * decrement.
        if (steps >= (range + c.decrement - 1) / c.decrement) return c.reservePrice;
        return c.startPrice - steps * c.decrement;
    }

    function currentPrice(bytes32 campaignId) external view returns (uint256) {
        return priceAt(campaignId, block.timestamp);
    }

    /// @notice Pay outstanding callback-proxy debt from this contract's balance so callbacks resume.
    function coverDebt() external {
        _coverDebt();
    }
}
