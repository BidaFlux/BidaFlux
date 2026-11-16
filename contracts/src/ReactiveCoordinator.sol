// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { AbstractReactive } from "reactive-lib/base/AbstractReactive.sol";
import { ISystemContract } from "reactive-lib/interfaces/ISystemContract.sol";

/// @title ReactiveCoordinator
/// @notice Deployed on Reactive Lasna. Relays purchase intents from the vaults to the Base escrow (hop 1) and
/// relays the escrow's outcome events back to the vaults (hop 2). Holds no funds and never decides a winner.
contract ReactiveCoordinator is AbstractReactive {
    uint64 public constant HOP1_GAS_LIMIT = 500_000;
    uint64 public constant HOP2_GAS_LIMIT = 400_000;
    uint8 private constant REJECT_DUPLICATE = 2;

    uint256 private constant INTENT_SUBMITTED =
        uint256(keccak256("IntentSubmitted(bytes32,bytes32,address,uint256,uint256)"));
    uint256 private constant SETTLED = uint256(keccak256("Settled(bytes32,bytes32,address,uint256,uint256,address)"));
    uint256 private constant INTENT_REJECTED = uint256(keccak256("IntentRejected(bytes32,bytes32,uint256,uint8)"));
    uint256 private constant RECLAIMED = uint256(keccak256("Reclaimed(bytes32)"));

    uint256 public immutable escrowChainId;
    address public immutable escrow;

    uint256[] public vaultChainIds;
    mapping(uint256 => address) public vaultOf;
    mapping(bytes32 => bool) public processed;

    constructor(uint256 escrowChainId_, address escrow_, uint256[] memory vaultChainIds_, address[] memory vaults_)
        payable
    {
        require(vaultChainIds_.length == vaults_.length && vaults_.length > 0, "bad vaults");
        escrowChainId = escrowChainId_;
        escrow = escrow_;

        for (uint256 i; i < vaults_.length; ++i) {
            vaultChainIds.push(vaultChainIds_[i]);
            vaultOf[vaultChainIds_[i]] = vaults_[i];
            SYSTEM.subscribe(vaultChainIds_[i], vaults_[i], INTENT_SUBMITTED, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        }
        SYSTEM.subscribe(escrowChainId_, escrow_, SETTLED, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(escrowChainId_, escrow_, INTENT_REJECTED, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(escrowChainId_, escrow_, RECLAIMED, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function react(LogRecord calldata log_) external override onlySystem {
        // Unrecognised logs fall through: a revert would still be billed.
        if (log_.contractAddress == vaultOf[log_.chainId] && log_.topic0 == INTENT_SUBMITTED) {
            if (_markProcessed(log_)) _onIntent(log_);
        } else if (log_.chainId == escrowChainId && log_.contractAddress == escrow) {
            if (log_.topic0 == SETTLED) {
                if (_markProcessed(log_)) _onSettled(log_);
            } else if (log_.topic0 == INTENT_REJECTED) {
                if (_markProcessed(log_)) _onRejected(log_);
            } else if (log_.topic0 == RECLAIMED) {
                if (_markProcessed(log_)) _onReclaimed(log_);
            }
        }
    }

    // ------------------------------------------------------------------ hop 1

    function _onIntent(LogRecord calldata log_) private {
        (uint256 lockAmount, uint256 intentTs) = abi.decode(log_.data, (uint256, uint256));
        bytes memory payload = abi.encodeWithSignature(
            "settle(address,bytes32,bytes32,address,uint256,uint256,uint256)",
            address(0),
            bytes32(log_.topic1), // campaignId
            bytes32(log_.topic2), // intentId
            address(uint160(log_.topic3)), // buyer
            log_.chainId,
            lockAmount,
            intentTs
        );
        _callback(escrowChainId, escrow, HOP1_GAS_LIMIT, payload);
    }

    // ------------------------------------------------------------------ hop 2

    function _onSettled(LogRecord calldata log_) private {
        (uint256 srcChainId, uint256 price, address payout) = abi.decode(log_.data, (uint256, uint256, address));
        _finalizeAll(bytes32(log_.topic1), bytes32(log_.topic2), srcChainId, price, payout);
    }

    function _onReclaimed(LogRecord calldata log_) private {
        _finalizeAll(bytes32(log_.topic1), bytes32(0), 0, 0, address(0));
    }

    function _finalizeAll(bytes32 campaignId, bytes32 winnerIntentId, uint256 winnerChainId, uint256 price, address payout)
        private
    {
        bytes memory payload = abi.encodeWithSignature(
            "finalizeCampaign(address,bytes32,bytes32,uint256,uint256,address)",
            address(0),
            campaignId,
            winnerIntentId,
            winnerChainId,
            price,
            payout
        );
        uint256 n = vaultChainIds.length;
        for (uint256 i; i < n; ++i) {
            uint256 chainId = vaultChainIds[i];
            _callback(chainId, vaultOf[chainId], HOP2_GAS_LIMIT, payload);
        }
    }

    function _onRejected(LogRecord calldata log_) private {
        (uint256 srcChainId, uint8 reason) = abi.decode(log_.data, (uint256, uint8));
        // A duplicate rejection can refer to the winning intent; releasing it would free the winner's funds.
        if (reason == REJECT_DUPLICATE) return;
        address vault = vaultOf[srcChainId];
        if (vault == address(0)) return;
        bytes memory payload = abi.encodeWithSignature("releaseIntent(address,bytes32)", address(0), bytes32(log_.topic2));
        _callback(srcChainId, vault, HOP2_GAS_LIMIT, payload);
    }

    // --------------------------------------------------------------- internal

    /// @dev Each origin log is relayed at most once.
    function _markProcessed(LogRecord calldata log_) private returns (bool) {
        bytes32 key = keccak256(abi.encode(log_.chainId, log_.txHash, log_.logIndex));
        if (processed[key]) return false;
        processed[key] = true;
        return true;
    }

    function _callback(uint256 chainId, address recipient, uint64 gasLimit, bytes memory payload) private {
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: chainId, recipient: recipient, gasLimit: gasLimit, payload: payload
            })
        );
    }

    function vaultCount() external view returns (uint256) {
        return vaultChainIds.length;
    }

    function coverDebt() external {
        _coverDebt();
    }
}
