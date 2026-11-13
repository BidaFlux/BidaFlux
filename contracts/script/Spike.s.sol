// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Script, console } from "forge-std/Script.sol";
import { IPayable } from "reactive-lib/interfaces/IPayable.sol";
import { SpikeOrigin } from "../src/spike/SpikeOrigin.sol";
import { SpikeCallback } from "../src/spike/SpikeCallback.sol";
import { SpikeReactive } from "../src/spike/SpikeReactive.sol";

/// Step 1 (Unichain or Base Sepolia): forge script script/Spike.s.sol:DeployOrigin --rpc-url unichain_sepolia --broadcast
contract DeployOrigin is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        SpikeOrigin origin = new SpikeOrigin();
        vm.stopBroadcast();
        console.log("SpikeOrigin:", address(origin));
    }
}

/// Step 2 (Base Sepolia). The callback needs the reactive contract's address and vice versa, so precompute it:
/// REACTIVE_ADDR = `cast compute-address <deployer> --nonce <deployer's next nonce on Lasna>`.
/// Env: CALLBACK_PROXY (0x476F44b11F5C942c58f4c8E3d0300E5710743585 on Base Sepolia), REACTIVE_ADDR.
contract DeployCallback is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        SpikeCallback cb = new SpikeCallback{ value: vm.envOr("CALLBACK_FUND_WEI", uint256(0.005 ether)) }(
            IPayable(payable(vm.envAddress("CALLBACK_PROXY"))), vm.envAddress("REACTIVE_ADDR")
        );
        vm.stopBroadcast();
        console.log("SpikeCallback:", address(cb));
    }
}

/// Step 3 (Lasna): env ORIGIN_CHAIN_ID, ORIGIN_ADDR, DEST_CHAIN_ID, DEST_ADDR.
contract DeployReactive is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        SpikeReactive r = new SpikeReactive{ value: vm.envOr("REACTIVE_FUND_WEI", uint256(1 ether)) }(
            vm.envUint("ORIGIN_CHAIN_ID"), vm.envAddress("ORIGIN_ADDR"), vm.envUint("DEST_CHAIN_ID"), vm.envAddress("DEST_ADDR")
        );
        vm.stopBroadcast();
        console.log("SpikeReactive:", address(r));
    }
}
