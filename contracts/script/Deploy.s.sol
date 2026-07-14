// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/tokens/WETH.sol";
import "../src/tokens/WRITUAL.sol";
import "../src/swap/LiquidityPool.sol";
import "../src/swap/SwapRouter.sol";
import "../src/bridge/BridgeLock.sol";
import "../src/bridge/BridgeMint.sol";
import "../src/bridge/CrossChainSwap.sol";
import "../src/intent/IntentExecutor.sol";
import "../src/treasury/Treasury.sol";

/// @title Deploy - Deployment Script for Ritual Swap
/// @notice Deploy all contracts. Run separately per chain:
///   Ritual:          forge script script/Deploy.s.sol:DeployRitual --rpc-url $RITUAL_RPC --broadcast
///   Ethereum Sepolia: forge script script/Deploy.s.sol:DeploySourceChain --rpc-url $ETH_SEPOLIA_RPC --broadcast
///   Base Sepolia:     forge script script/Deploy.s.sol:DeploySourceChain --rpc-url $BASE_SEPOLIA_RPC --broadcast

/// @dev Deploy all Ritual chain contracts
contract DeployRitual is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address relayer = vm.envAddress("RELAYER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy tokens
        WETH weth = new WETH(deployer);
        WRITUAL writual = new WRITUAL();

        // 2. Deploy pool
        LiquidityPool pool = new LiquidityPool();
        pool.initialize(address(weth), address(writual));

        // 3. Deploy router
        SwapRouter router = new SwapRouter(address(weth), address(writual), address(pool));

        // 4. Deploy bridge contracts
        BridgeMint bridgeMint = new BridgeMint(address(weth), relayer, deployer);
        CrossChainSwap crossChainSwap = new CrossChainSwap(address(weth), address(router), relayer, deployer);

        // 5. Grant MINTER_ROLE on WETH to bridge contracts
        bytes32 MINTER_ROLE = weth.MINTER_ROLE();
        weth.grantRole(MINTER_ROLE, address(bridgeMint));
        weth.grantRole(MINTER_ROLE, address(crossChainSwap));

        // 6. Deploy utility contracts
        IntentExecutor intentExecutor = new IntentExecutor(deployer);
        Treasury treasury = new Treasury(deployer);

        vm.stopBroadcast();

        // Log deployed addresses
        console.log("=== Ritual Chain Deployment ===");
        console.log("WETH:           ", address(weth));
        console.log("WRITUAL:        ", address(writual));
        console.log("LiquidityPool:  ", address(pool));
        console.log("SwapRouter:     ", address(router));
        console.log("BridgeMint:     ", address(bridgeMint));
        console.log("CrossChainSwap: ", address(crossChainSwap));
        console.log("IntentExecutor: ", address(intentExecutor));
        console.log("Treasury:       ", address(treasury));
    }
}

/// @dev Deploy BridgeLock on a source chain (Ethereum Sepolia or Base Sepolia)
contract DeploySourceChain is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address relayer = vm.envAddress("RELAYER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        BridgeLock bridgeLock = new BridgeLock(relayer, deployer);

        vm.stopBroadcast();

        console.log("=== Source Chain Deployment ===");
        console.log("Chain ID:   ", block.chainid);
        console.log("BridgeLock: ", address(bridgeLock));
    }
}

/// @dev Seed initial liquidity for the WETH/WRITUAL pool (run on Ritual)
contract SeedLiquidity is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address wethAddr = vm.envAddress("WETH_ADDRESS");
        address routerAddr = vm.envAddress("ROUTER_ADDRESS");

        uint256 wethAmount = vm.envOr("WETH_AMOUNT", uint256(200 ether)); // 200 WETH
        uint256 ritualAmount = vm.envOr("RITUAL_AMOUNT", uint256(10 ether)); // 10 RITUAL (20:1 ratio)

        vm.startBroadcast(deployerPrivateKey);

        // Approve WETH for router
        IERC20(wethAddr).approve(routerAddr, wethAmount);

        // Add liquidity with native RITUAL
        SwapRouter(payable(routerAddr)).addLiquidityRITUAL{value: ritualAmount}(wethAmount);

        vm.stopBroadcast();

        console.log("=== Liquidity Seeded ===");
        console.log("WETH deposited:   ", wethAmount);
        console.log("RITUAL deposited: ", ritualAmount);
        console.log("Ratio: 20 WETH = 1 RITUAL");
    }
}
