// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/tokens/WETH.sol";
import "../src/swap/SwapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Grant MINTER_ROLE to deployer, mint WETH, and seed liquidity pool
/// Pool ratio: 20 WETH = 1 RITUAL
contract SeedPool is Script {
    address constant WETH_ADDR = 0xB0744700a04A33536B91604Bf5C423e3FB97883E;
    address constant ROUTER_ADDR = 0xf27b0c56452443F5306C5904100A0fde6F23577B;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Seed amounts: 20 WETH + 1 RITUAL (20:1 ratio)
        uint256 wethAmount = 20 ether;
        uint256 ritualAmount = 1 ether;

        console.log("Deployer:", deployer);
        console.log("WETH to mint:", wethAmount);
        console.log("RITUAL to deposit:", ritualAmount);

        vm.startBroadcast(deployerPrivateKey);

        WETH weth = WETH(WETH_ADDR);

        // Step 1: Grant MINTER_ROLE to deployer
        bytes32 MINTER_ROLE = weth.MINTER_ROLE();
        if (!weth.hasRole(MINTER_ROLE, deployer)) {
            weth.grantRole(MINTER_ROLE, deployer);
            console.log("Granted MINTER_ROLE to deployer");
        }

        // Step 2: Mint WETH
        weth.mint(deployer, wethAmount);
        console.log("Minted WETH:", wethAmount);

        // Step 3: Approve router to spend WETH
        weth.approve(ROUTER_ADDR, wethAmount);
        console.log("Approved router");

        // Step 4: Add liquidity with WETH + native RITUAL
        SwapRouter(payable(ROUTER_ADDR)).addLiquidityRITUAL{value: ritualAmount}(wethAmount);
        console.log("Liquidity added!");

        vm.stopBroadcast();

        // Verify
        (uint256 rWETH, uint256 rWRITUAL) = SwapRouter(payable(ROUTER_ADDR)).getPoolReserves();
        console.log("=== Pool Seeded ===");
        console.log("Reserve WETH:", rWETH);
        console.log("Reserve WRITUAL:", rWRITUAL);
        console.log("Rate: 20 WETH = 1 RITUAL");
    }
}
