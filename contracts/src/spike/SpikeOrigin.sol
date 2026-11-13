// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @notice Throwaway origin contract for the Reactive loop spike. Deploy on Base Sepolia or Unichain Sepolia.
contract SpikeOrigin {
    event Ping(uint256 indexed id, address indexed sender, uint256 originTs);

    uint256 public nextId;

    function ping() external returns (uint256 id) {
        id = ++nextId;
        emit Ping(id, msg.sender, block.timestamp);
    }
}
