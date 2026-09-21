// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {NoirpayRouter} from "../src/NoirpayRouter.sol";

/// forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_RPC_URL --broadcast
/// Writes deployments/<chainId>.json (router address + deployment block) for the dapp and indexer.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        NoirpayRouter router = new NoirpayRouter();
        vm.stopBroadcast();

        // No block number here: on Arbitrum-based chains `block.number` is the L1 block. Read the L2 deployment
        // block from broadcast/Deploy.s.sol/<chainId>/run-latest.json (receipts[0].blockNumber) instead.
        string memory json = string.concat(
            '{"chainId":', vm.toString(block.chainid), ',"NoirpayRouter":"', vm.toString(address(router)), '"}'
        );
        vm.writeFile(string.concat("deployments/", vm.toString(block.chainid), ".json"), json);
        console.log("NoirpayRouter", address(router));
    }
}
