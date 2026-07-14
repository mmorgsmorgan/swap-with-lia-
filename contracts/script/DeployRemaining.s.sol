// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/tokens/WETH.sol";
import "../src/swap/LiquidityPool.sol";
import "../src/swap/SwapRouter.sol";
import "../src/bridge/BridgeLock.sol";
import "../src/bridge/BridgeMint.sol";
import "../src/bridge/CrossChainSwap.sol";
import "../src/intent/IntentExecutor.sol";
import "../src/treasury/Treasury.sol";

/// @dev Deploy remaining contracts that failed in first deployment
/// WETH, WRITUAL, Pool already deployed:
///   WETH:     0xB0744700a04A33536B91604Bf5C423e3FB97883E
///   WRITUAL:  0xD542E471cB699b7A7C0dafE382E6Dc89506fcc18
///   Pool:     0xe186d9A14C70302fe71d10fE225CE44CB076c285
contract DeployRemaining is Script {
    address constant WETH_ADDR = 0xB0744700a04A33536B91604Bf5C423e3FB97883E;
    address constant WRITUAL_ADDR = 0xD542E471cB699b7A7C0dafE382E6Dc89506fcc18;
    address constant POOL_ADDR = 0xe186d9A14C70302fe71d10fE225CE44CB076c285;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address relayer = vm.envAddress("RELAYER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Initialize pool (wasn't done yet)
        LiquidityPool(POOL_ADDR).initialize(WETH_ADDR, WRITUAL_ADDR);

        // 2. Deploy SwapRouter
        SwapRouter router = new SwapRouter(WETH_ADDR, WRITUAL_ADDR, POOL_ADDR);

        // 3. Deploy BridgeMint
        BridgeMint bridgeMint = new BridgeMint(WETH_ADDR, relayer, deployer);

        // 4. Deploy CrossChainSwap
        CrossChainSwap crossChainSwap = new CrossChainSwap(WETH_ADDR, address(router), relayer, deployer);

        // 5. Grant MINTER_ROLE on WETH to bridge contracts
        bytes32 MINTER_ROLE = WETH(WETH_ADDR).MINTER_ROLE();
        WETH(WETH_ADDR).grantRole(MINTER_ROLE, address(bridgeMint));
        WETH(WETH_ADDR).grantRole(MINTER_ROLE, address(crossChainSwap));

        // 6. Deploy IntentExecutor & Treasury
        IntentExecutor intentExecutor = new IntentExecutor(deployer);
        Treasury treasury = new Treasury(deployer);

        vm.stopBroadcast();

        console.log("=== Remaining Ritual Deployment ===");
        console.log("SwapRouter:     ", address(router));
        console.log("BridgeMint:     ", address(bridgeMint));
        console.log("CrossChainSwap: ", address(crossChainSwap));
        console.log("IntentExecutor: ", address(intentExecutor));
        console.log("Treasury:       ", address(treasury));
        console.log("Pool initialized: WETH + WRITUAL");
    }
}
