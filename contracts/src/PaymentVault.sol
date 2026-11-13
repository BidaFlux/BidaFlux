// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AbstractCallback } from "reactive-lib/base/AbstractCallback.sol";
import { IPayable } from "reactive-lib/interfaces/IPayable.sol";

/// @title PaymentVault
/// @notice Per-chain buyer deposits. Submitting an intent locks funds; only reactive callbacks pay the seller
/// or release a rejected intent. Losers pull their funds back once the campaign is final.
contract PaymentVault is AbstractCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { None, Locked, Paid, Unlocked }

    struct Intent {
        address buyer;
        bytes32 campaignId;
        uint256 amount;
        uint256 lockedAt;
        Status status;
    }

    /// @notice A buyer can free a still-locked intent after this long. Known limitation: if the final callback
    /// for a winning intent never arrives within this window, the winner could unlock; see docs/payment-flow.md.
    uint256 public constant MAX_LOCK = 7 days;

    IERC20 public immutable token;

    mapping(address => uint256) public balance;
    mapping(address => uint256) public nonces;
    mapping(bytes32 => Intent) public intents;
    mapping(bytes32 => bool) public finalized;
    mapping(bytes32 => bytes32) public winnerIntentOf;

    event Deposited(address indexed buyer, uint256 amount);
    event Withdrawn(address indexed buyer, uint256 amount);
    event IntentSubmitted(
        bytes32 indexed campaignId, bytes32 indexed intentId, address indexed buyer, uint256 lockAmount, uint256 intentTs
    );
    event CampaignFinalized(bytes32 indexed campaignId, bytes32 indexed winnerIntentId);
    event SellerPaid(bytes32 indexed campaignId, bytes32 indexed intentId, address indexed payout, uint256 price);
    event IntentUnlocked(bytes32 indexed intentId, address indexed buyer, uint256 amount);

    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error NotLocked(Status status);
    error NotFinal();
    error IsWinner();
    error LockActive();

    constructor(IPayable callbackProxy_, address reactive_, IERC20 token_)
        payable
        AbstractCallback(callbackProxy_, reactive_)
    {
        token = token_;
    }

    // ------------------------------------------------------------------ buyer

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        balance[msg.sender] += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balance[msg.sender];
        if (amount > bal) revert InsufficientBalance(amount, bal);
        balance[msg.sender] = bal - amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Lock `lockAmount` of the caller's balance as a purchase intent. Not a completed purchase.
    function submitIntent(bytes32 campaignId, uint256 lockAmount) external returns (bytes32 intentId) {
        if (lockAmount == 0) revert ZeroAmount();
        uint256 bal = balance[msg.sender];
        if (lockAmount > bal) revert InsufficientBalance(lockAmount, bal);

        balance[msg.sender] = bal - lockAmount;
        intentId = keccak256(abi.encode(block.chainid, address(this), msg.sender, nonces[msg.sender]++));
        intents[intentId] = Intent(msg.sender, campaignId, lockAmount, block.timestamp, Status.Locked);
        emit IntentSubmitted(campaignId, intentId, msg.sender, lockAmount, block.timestamp);
    }

    /// @notice Loser path: free a locked intent once the campaign is final and it did not win.
    function unlock(bytes32 intentId) external nonReentrant {
        Intent storage i = intents[intentId];
        if (i.status != Status.Locked) revert NotLocked(i.status);
        if (!finalized[i.campaignId]) revert NotFinal();
        if (winnerIntentOf[i.campaignId] == intentId) revert IsWinner();
        _unlock(intentId, i);
    }

    /// @notice Safety valve: free a still-locked intent after `MAX_LOCK`.
    function unlockAfterTimeout(bytes32 intentId) external nonReentrant {
        Intent storage i = intents[intentId];
        if (i.status != Status.Locked) revert NotLocked(i.status);
        if (block.timestamp < i.lockedAt + MAX_LOCK) revert LockActive();
        _unlock(intentId, i);
    }

    // -------------------------------------------------------------- callbacks

    /// @notice Hop 2: the campaign is final. Idempotent. On the winner's chain, pays the seller and unlocks the
    /// remainder; elsewhere marks the campaign final so losers can unlock.
    /// @param winnerIntentId Zero when the campaign ended without a winner.
    function finalizeCampaign(
        address rvm_,
        bytes32 campaignId,
        bytes32 winnerIntentId,
        uint256 winnerChainId,
        uint256 price,
        address payout
    ) external onlyServiceProvider onlyCallbackSender(rvm_) nonReentrant {
        if (!finalized[campaignId]) {
            finalized[campaignId] = true;
            winnerIntentOf[campaignId] = winnerIntentId;
            emit CampaignFinalized(campaignId, winnerIntentId);
        }

        if (winnerIntentId == bytes32(0) || winnerChainId != block.chainid) return;
        if (winnerIntentOf[campaignId] != winnerIntentId) return;

        Intent storage i = intents[winnerIntentId];
        if (i.status != Status.Locked || i.campaignId != campaignId) return; // already paid, or not ours

        uint256 pay = price > i.amount ? i.amount : price; // escrow guarantees lock >= price
        i.status = Status.Paid;
        balance[i.buyer] += i.amount - pay;
        token.safeTransfer(payout, pay);
        emit SellerPaid(campaignId, winnerIntentId, payout, pay);
    }

    /// @notice Hop 2: the escrow rejected this intent. Idempotent. Reactive must not relay duplicate rejections.
    function releaseIntent(address rvm_, bytes32 intentId)
        external
        onlyServiceProvider
        onlyCallbackSender(rvm_)
        nonReentrant
    {
        Intent storage i = intents[intentId];
        if (i.status != Status.Locked) return;
        _unlock(intentId, i);
    }

    /// @notice Pay outstanding callback-proxy debt from this contract's balance so callbacks resume.
    function coverDebt() external {
        _coverDebt();
    }

    // ---------------------------------------------------------------- internal

    function _unlock(bytes32 intentId, Intent storage i) internal {
        i.status = Status.Unlocked;
        balance[i.buyer] += i.amount;
        emit IntentUnlocked(intentId, i.buyer, i.amount);
    }
}
