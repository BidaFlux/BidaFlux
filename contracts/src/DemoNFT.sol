// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Testnet-only NFT with open minting, used as the auction item in demos.
contract DemoNFT is ERC721 {
    uint256 public nextId;

    constructor() ERC721("BidaFlux Demo NFT", "BDNFT") { }

    function mint() external returns (uint256 id) {
        id = ++nextId;
        _mint(msg.sender, id);
    }
}
