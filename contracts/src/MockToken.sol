// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only payment token with a public faucet. Deploy one per chain, same decimals.
contract MockToken is ERC20 {
    uint256 public constant FAUCET_MAX = 10_000e6;

    constructor() ERC20("BidaFlux Test USD", "bUSD") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(uint256 amount) external {
        require(amount <= FAUCET_MAX, "faucet cap");
        _mint(msg.sender, amount);
    }
}
