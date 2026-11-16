// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { AbstractReactive } from "reactive-lib/base/AbstractReactive.sol";
import { ISystemContract } from "reactive-lib/interfaces/ISystemContract.sol";

/// @notice Throwaway reactive contract for the loop spike. Deploy on Reactive Lasna.
/// Subscribes to SpikeOrigin.Ping on one origin chain and calls SpikeCallback.pong on a destination chain.
contract SpikeReactive is AbstractReactive {
    uint64 private constant CALLBACK_GAS_LIMIT = 300_000;
    uint256 private constant PING_TOPIC0 = uint256(keccak256("Ping(uint256,address,uint256)"));

    uint256 public immutable originChainId;
    address public immutable origin;
    uint256 public immutable destChainId;
    address public immutable destination;

    constructor(uint256 originChainId_, address origin_, uint256 destChainId_, address destination_) payable {
        originChainId = originChainId_;
        origin = origin_;
        destChainId = destChainId_;
        destination = destination_;
        SYSTEM.subscribe(originChainId_, origin_, PING_TOPIC0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function react(LogRecord calldata log_) external override onlySystem {
        if (log_.chainId != originChainId || log_.contractAddress != origin || log_.topic0 != PING_TOPIC0) return;

        uint256 id = log_.topic1;
        uint256 originTs = abi.decode(log_.data, (uint256));
        bytes memory payload = abi.encodeWithSignature(
            "pong(address,uint256,uint256,uint256)", address(0), id, log_.chainId, originTs
        );
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: destChainId,
                recipient: destination,
                gasLimit: CALLBACK_GAS_LIMIT,
                payload: payload
            })
        );
    }

    function coverDebt() external {
        _coverDebt();
    }
}
