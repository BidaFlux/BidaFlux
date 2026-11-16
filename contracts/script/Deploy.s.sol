// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPayable } from "reactive-lib/interfaces/IPayable.sol";
import { AuctionEscrow } from "../src/AuctionEscrow.sol";
import { PaymentVault } from "../src/PaymentVault.sol";
import { MockToken } from "../src/MockToken.sol";
import { DemoNFT } from "../src/DemoNFT.sol";
import { ReactiveCoordinator } from "../src/ReactiveCoordinator.sol";

interface ICallbackProxy {
    function depositTo(address) external payable;
    function reserves(address) external view returns (uint256);
}

/// Deployment order (see docs/demo-runbook.md):
///  1. Precompute RVM_ADDR = `cast compute-address <deployer> --nonce <next Lasna nonce>`.
///  2. DeployBase  (Base Sepolia)     -> escrow, base vault, token, demo NFT
///  3. DeployUni   (Unichain Sepolia) -> unichain vault, token
///  4. DeployLasna (Reactive Lasna)   -> coordinator (address must equal RVM_ADDR)
/// Env common to all: DEPLOYER_PRIVATE_KEY, RVM_ADDR.
contract DeployBase is Script {
    address internal constant CALLBACK_PROXY = 0x476F44b11F5C942c58f4c8E3d0300E5710743585;

    function run() external {
        address rvm = vm.envAddress("RVM_ADDR");
        uint256 fund = vm.envOr("CALLBACK_RESERVE_WEI", uint256(0.003 ether));
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        MockToken token = new MockToken();
        DemoNFT nft = new DemoNFT();
        AuctionEscrow escrow = new AuctionEscrow(IPayable(payable(CALLBACK_PROXY)), rvm);
        PaymentVault vault = new PaymentVault(IPayable(payable(CALLBACK_PROXY)), rvm, IERC20(address(token)));
        ICallbackProxy(CALLBACK_PROXY).depositTo{ value: fund }(address(escrow));
        ICallbackProxy(CALLBACK_PROXY).depositTo{ value: fund }(address(vault));
        vm.stopBroadcast();
        console.log("BaseToken:", address(token));
        console.log("DemoNFT:", address(nft));
        console.log("AuctionEscrow:", address(escrow));
        console.log("BaseVault:", address(vault));
    }
}

contract DeployUni is Script {
    address internal constant CALLBACK_PROXY = 0x775c9B990ADe401060B78D0e98684eEf8d2466C1;

    function run() external {
        address rvm = vm.envAddress("RVM_ADDR");
        uint256 fund = vm.envOr("CALLBACK_RESERVE_WEI", uint256(0.003 ether));
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        MockToken token = new MockToken();
        PaymentVault vault = new PaymentVault(IPayable(payable(CALLBACK_PROXY)), rvm, IERC20(address(token)));
        ICallbackProxy(CALLBACK_PROXY).depositTo{ value: fund }(address(vault));
        vm.stopBroadcast();
        console.log("UniToken:", address(token));
        console.log("UniVault:", address(vault));
    }
}

/// Env: ESCROW_ADDR, BASE_VAULT_ADDR, UNI_VAULT_ADDR.
contract DeployLasna is Script {
    uint256 internal constant BASE_SEPOLIA = 84532;
    uint256 internal constant UNICHAIN_SEPOLIA = 1301;

    function run() external {
        uint256[] memory chains = new uint256[](2);
        chains[0] = BASE_SEPOLIA;
        chains[1] = UNICHAIN_SEPOLIA;
        address[] memory vaults = new address[](2);
        vaults[0] = vm.envAddress("BASE_VAULT_ADDR");
        vaults[1] = vm.envAddress("UNI_VAULT_ADDR");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        ReactiveCoordinator rc = new ReactiveCoordinator{ value: vm.envOr("REACTIVE_FUND_WEI", uint256(2 ether)) }(
            BASE_SEPOLIA, vm.envAddress("ESCROW_ADDR"), chains, vaults
        );
        vm.stopBroadcast();
        require(address(rc) == vm.envAddress("RVM_ADDR"), "RVM_ADDR mismatch: recompute from the Lasna nonce");
        console.log("ReactiveCoordinator:", address(rc));
    }
}
