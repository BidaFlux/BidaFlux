// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { AbstractCallback } from "reactive-lib/base/AbstractCallback.sol";
import { IPayable } from "reactive-lib/interfaces/IPayable.sol";

/// @notice Throwaway callback target for the Reactive loop spike. Deploy on Base Sepolia.
contract SpikeCallback is AbstractCallback {
    event Pong(uint256 indexed id, uint256 srcChainId, uint256 originTs, uint256 callbackTs);

    constructor(IPayable callbackProxy_, address reactive_) payable AbstractCallback(callbackProxy_, reactive_) { }

    /// @param rvm_ Injected by the callback proxy; must equal the authorized reactive contract.
    function pong(address rvm_, uint256 id_, uint256 srcChainId_, uint256 originTs_)
        external
        onlyServiceProvider
        onlyCallbackSender(rvm_)
    {
        emit Pong(id_, srcChainId_, originTs_, block.timestamp);
    }

    /// @notice Pay outstanding callback-proxy debt from this contract's balance so callbacks resume.
    function coverDebt() external {
        _coverDebt();
    }
}
