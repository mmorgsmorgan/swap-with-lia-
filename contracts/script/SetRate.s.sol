// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/tokens/WETH.sol";
import "../src/swap/SwapRouter.sol";

/// @dev Set the pool price to 1 RITUAL = 25 WETH.
/// The rate is the constant-product reserve ratio (reserveWETH / reserveWRITUAL),
/// so this tops the reserves up to a clean 25 : 1 ratio. Run with the deployer key
/// (which holds/gets MINTER_ROLE on WETH) and a little native RITUAL for the deposit.
///
///   cd contracts
///   DEPLOYER_PRIVATE_KEY=0x... forge script script/SetRate.s.sol \
///     --rpc-url https://rpc.ritualfoundation.org --broadcast
contract SetRate is Script {
    address constant WETH_ADDR = 0xB0744700a04A33536B91604Bf5C423e3FB97883E;
    address constant ROUTER_ADDR = 0xf27b0c56452443F5306C5904100A0fde6F23577B;

    // Target reserves → 1 RITUAL = 25 WETH
    uint256 constant TARGET_WETH = 25 ether;
    uint256 constant TARGET_WRITUAL = 1 ether;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        SwapRouter router = SwapRouter(payable(ROUTER_ADDR));

        (uint256 rW, uint256 rR) = router.getPoolReserves();
        console.log("Current  WETH reserve:", rW);
        console.log("Current  WRITUAL reserve:", rR);

        require(
            TARGET_WETH >= rW && TARGET_WRITUAL >= rR,
            "Pool price already >= 25; lower it with a WETH->RITUAL swap instead"
        );

        uint256 addW = TARGET_WETH - rW;
        uint256 addR = TARGET_WRITUAL - rR;
        require(addR > 0, "WRITUAL reserve already at target; nudge with a swap");

        console.log("Depositing WETH:", addW);
        console.log("Depositing RITUAL:", addR);

        vm.startBroadcast(pk);

        WETH weth = WETH(WETH_ADDR);
        bytes32 MINTER_ROLE = weth.MINTER_ROLE();
        if (!weth.hasRole(MINTER_ROLE, deployer)) {
            weth.grantRole(MINTER_ROLE, deployer);
        }
        weth.mint(deployer, addW);
        weth.approve(ROUTER_ADDR, addW);
        router.addLiquidityRITUAL{value: addR}(addW);

        vm.stopBroadcast();

        (uint256 nW, uint256 nR) = router.getPoolReserves();
        console.log("=== Rate updated ===");
        console.log("New WETH reserve:", nW);
        console.log("New WRITUAL reserve:", nR);
        console.log("Rate: 1 RITUAL =", nR == 0 ? 0 : nW / nR, "WETH");
    }
}
