// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/tokens/WETH.sol";
import "../src/tokens/WRITUAL.sol";
import "../src/swap/LiquidityPool.sol";
import "../src/swap/SwapRouter.sol";
import "../src/bridge/BridgeLock.sol";
import "../src/bridge/BridgeMint.sol";
import "../src/bridge/CrossChainSwap.sol";
import "../src/treasury/Treasury.sol";

/// @title RitualSwapTest - Comprehensive test suite
contract RitualSwapTest is Test {
    WETH public weth;
    WRITUAL public writual;
    LiquidityPool public pool;
    SwapRouter public router;
    BridgeLock public bridgeLock;
    BridgeMint public bridgeMint;
    CrossChainSwap public crossChainSwap;
    Treasury public treasury;

    address public deployer = address(1);
    address public user = address(2);
    address public relayer;
    uint256 public relayerPrivateKey = 0xA11CE;

    function setUp() public {
        relayer = vm.addr(relayerPrivateKey);

        vm.startPrank(deployer);

        // Deploy tokens
        weth = new WETH(deployer);
        writual = new WRITUAL();

        // Deploy pool and initialize
        pool = new LiquidityPool();
        pool.initialize(address(weth), address(writual));

        // Deploy router
        router = new SwapRouter(address(weth), address(writual), address(pool));

        // Deploy bridge contracts
        bridgeLock = new BridgeLock(relayer, deployer);
        bridgeMint = new BridgeMint(address(weth), relayer, deployer);
        crossChainSwap = new CrossChainSwap(address(weth), address(router), relayer, deployer);

        // Grant MINTER_ROLE
        bytes32 MINTER_ROLE = weth.MINTER_ROLE();
        weth.grantRole(MINTER_ROLE, address(bridgeMint));
        weth.grantRole(MINTER_ROLE, address(crossChainSwap));
        weth.grantRole(MINTER_ROLE, deployer); // for test seeding

        // Deploy treasury
        treasury = new Treasury(deployer);

        // Seed liquidity: 200 WETH + 10 WRITUAL (20:1 ratio)
        weth.mint(deployer, 200 ether);
        weth.approve(address(router), 200 ether);
        vm.deal(deployer, 100 ether);
        router.addLiquidityRITUAL{value: 10 ether}(200 ether);

        vm.stopPrank();

        // Give user some funds
        vm.deal(user, 100 ether);
        vm.prank(deployer);
        weth.mint(user, 50 ether);
    }

    // ==================== WETH Tests ====================

    function test_WETH_MintWithRole() public {
        vm.prank(deployer);
        weth.mint(user, 10 ether);
        assertEq(weth.balanceOf(user), 60 ether); // 50 from setup + 10
    }

    function test_WETH_MintWithoutRoleReverts() public {
        vm.prank(user);
        vm.expectRevert();
        weth.mint(user, 10 ether);
    }

    function test_WETH_Burn() public {
        vm.prank(user);
        weth.burn(5 ether);
        assertEq(weth.balanceOf(user), 45 ether);
    }

    function test_WETH_BurnFrom() public {
        vm.prank(user);
        weth.approve(deployer, 5 ether);
        vm.prank(deployer);
        weth.burnFrom(user, 5 ether);
        assertEq(weth.balanceOf(user), 45 ether);
    }

    // ==================== WRITUAL Tests ====================

    function test_WRITUAL_Deposit() public {
        vm.prank(user);
        writual.deposit{value: 5 ether}();
        assertEq(writual.balanceOf(user), 5 ether);
    }

    function test_WRITUAL_Withdraw() public {
        vm.prank(user);
        writual.deposit{value: 5 ether}();
        uint256 balBefore = user.balance;
        vm.prank(user);
        writual.withdraw(3 ether);
        assertEq(writual.balanceOf(user), 2 ether);
        assertEq(user.balance, balBefore + 3 ether);
    }

    function test_WRITUAL_ReceiveAutoDeposits() public {
        vm.prank(user);
        (bool success,) = address(writual).call{value: 2 ether}("");
        assertTrue(success);
        assertEq(writual.balanceOf(user), 2 ether);
    }

    function test_WRITUAL_WithdrawExcessReverts() public {
        vm.prank(user);
        writual.deposit{value: 1 ether}();
        vm.prank(user);
        vm.expectRevert("WRITUAL: insufficient balance");
        writual.withdraw(2 ether);
    }

    // ==================== SwapRouter Tests ====================

    function test_Router_GetAmountOut() public view {
        // With 200 WETH and 10 WRITUAL, swapping 20 WETH:
        // amountOut = (20 * 997 * 10) / (200 * 1000 + 20 * 997)
        // = (199400) / (200000 + 19940) = 199400 / 219940 ≈ 0.9066 WRITUAL
        uint256 amountOut = router.getAmountOut(20 ether, 200 ether, 10 ether);
        assertGt(amountOut, 0);
        assertLt(amountOut, 1 ether); // Should be less than 1 due to price impact
    }

    function test_Router_SwapWETHForRITUAL() public {
        uint256 amountIn = 20 ether;
        uint256 quote = router.getQuoteWETHToRITUAL(amountIn);

        uint256 ritualBefore = user.balance;

        vm.startPrank(user);
        weth.approve(address(router), amountIn);
        uint256 amountOut = router.swapExactWETHForRITUAL(amountIn, quote);
        vm.stopPrank();

        assertEq(user.balance, ritualBefore + amountOut);
        assertEq(weth.balanceOf(user), 50 ether - amountIn);
        assertGt(amountOut, 0);
    }

    function test_Router_SwapRITUALForWETH() public {
        uint256 amountIn = 1 ether; // 1 RITUAL

        uint256 wethBefore = weth.balanceOf(user);

        vm.prank(user);
        uint256 amountOut = router.swapExactRITUALForWETH{value: amountIn}(0);

        assertGt(amountOut, 0);
        assertEq(weth.balanceOf(user), wethBefore + amountOut);
    }

    function test_Router_SwapInsufficientOutputReverts() public {
        vm.startPrank(user);
        weth.approve(address(router), 1 ether);
        vm.expectRevert(SwapRouter.InsufficientOutputAmount.selector);
        router.swapExactWETHForRITUAL(1 ether, 100 ether); // Unrealistic min output
        vm.stopPrank();
    }

    function test_Router_GetQuotes() public view {
        uint256 ritualOut = router.getQuoteWETHToRITUAL(20 ether);
        uint256 wethOut = router.getQuoteRITUALToWETH(1 ether);
        assertGt(ritualOut, 0);
        assertGt(wethOut, 0);
    }

    function test_Router_GetPoolReserves() public view {
        (uint256 rWETH, uint256 rWRITUAL) = router.getPoolReserves();
        assertEq(rWETH, 200 ether);
        assertEq(rWRITUAL, 10 ether);
    }

    // ==================== BridgeLock Tests ====================

    function test_BridgeLock_LockETH() public {
        vm.prank(user);
        vm.expectEmit(true, true, false, true);
        emit BridgeLock.Locked(user, 1 ether, 1979, user, 0, false);
        bridgeLock.lockETH{value: 1 ether}(1979, user, false);
        assertEq(address(bridgeLock).balance, 1 ether);
    }

    function test_BridgeLock_LockETHDirectSwap() public {
        vm.prank(user);
        vm.expectEmit(true, true, false, true);
        emit BridgeLock.Locked(user, 20 ether, 1979, user, 0, true);
        bridgeLock.lockETH{value: 20 ether}(1979, user, true);
    }

    function test_BridgeLock_LockZeroReverts() public {
        vm.prank(user);
        vm.expectRevert("BridgeLock: zero amount");
        bridgeLock.lockETH{value: 0}(1979, user, false);
    }

    function test_BridgeLock_UnlockWithValidSignature() public {
        // Fund the bridge
        vm.deal(address(bridgeLock), 10 ether);

        uint256 amount = 1 ether;
        uint256 nonce_ = 0;
        uint256 chainId = block.chainid;

        bytes32 messageHash = bridgeLock.getMessageHash(user, amount, nonce_, chainId);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        uint256 balBefore = user.balance;
        bridgeLock.unlockETH(payable(user), amount, nonce_, signature);
        assertEq(user.balance, balBefore + amount);
        assertTrue(bridgeLock.processedNonces(nonce_));
    }

    function test_BridgeLock_UnlockInvalidSignatureReverts() public {
        vm.deal(address(bridgeLock), 10 ether);
        bytes memory badSig = new bytes(65);
        vm.expectRevert();
        bridgeLock.unlockETH(payable(user), 1 ether, 0, badSig);
    }

    function test_BridgeLock_ReplayProtection() public {
        vm.deal(address(bridgeLock), 10 ether);

        bytes32 messageHash = bridgeLock.getMessageHash(user, 1 ether, 0, block.chainid);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        bridgeLock.unlockETH(payable(user), 1 ether, 0, signature);

        vm.expectRevert("BridgeLock: nonce already processed");
        bridgeLock.unlockETH(payable(user), 1 ether, 0, signature);
    }

    function test_BridgeLock_PauseUnpause() public {
        vm.prank(deployer);
        bridgeLock.pause();

        vm.prank(user);
        vm.expectRevert();
        bridgeLock.lockETH{value: 1 ether}(1979, user, false);

        vm.prank(deployer);
        bridgeLock.unpause();

        vm.prank(user);
        bridgeLock.lockETH{value: 1 ether}(1979, user, false);
    }

    // ==================== BridgeMint Tests ====================

    function test_BridgeMint_MintWithValidSignature() public {
        uint256 amount = 5 ether;
        uint256 sourceChainId = 11155111;
        uint256 nonce_ = 0;

        bytes32 messageHash = bridgeMint.getMintMessageHash(user, amount, sourceChainId, nonce_);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        bridgeMint.mintWETH(user, amount, sourceChainId, nonce_, signature);
        assertEq(weth.balanceOf(user), 50 ether + amount);
    }

    function test_BridgeMint_MintInvalidSignatureReverts() public {
        bytes memory badSig = new bytes(65);
        vm.expectRevert();
        bridgeMint.mintWETH(user, 5 ether, 11155111, 0, badSig);
    }

    function test_BridgeMint_BurnForUnlock() public {
        vm.startPrank(user);
        weth.approve(address(bridgeMint), 10 ether);

        vm.expectEmit(true, false, false, true);
        emit BridgeMint.BurnForUnlock(user, 10 ether, 11155111, 0);
        bridgeMint.burnWETH(10 ether, 11155111);
        vm.stopPrank();

        assertEq(weth.balanceOf(user), 40 ether);
    }

    function test_BridgeMint_NonceTracking() public {
        bytes32 messageHash = bridgeMint.getMintMessageHash(user, 1 ether, 11155111, 0);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        bridgeMint.mintWETH(user, 1 ether, 11155111, 0, signature);

        vm.expectRevert("BridgeMint: nonce already processed");
        bridgeMint.mintWETH(user, 1 ether, 11155111, 0, signature);
    }

    // ==================== CrossChainSwap Tests ====================

    function test_CrossChainSwap_BridgeAndSwap() public {
        uint256 wethAmount = 20 ether;
        uint256 minRitualOut = 0; // Accept any output for test
        uint256 sourceChainId = 11155111;
        uint256 nonce_ = 0;

        bytes32 messageHash =
            crossChainSwap.getMessageHash(user, wethAmount, minRitualOut, sourceChainId, nonce_);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        uint256 ritualBefore = user.balance;
        crossChainSwap.bridgeAndSwap(payable(user), wethAmount, minRitualOut, sourceChainId, nonce_, signature);

        assertGt(user.balance, ritualBefore); // User received RITUAL
    }

    function test_CrossChainSwap_FallbackOnHighSlippage() public {
        uint256 wethAmount = 20 ether;
        uint256 minRitualOut = 100 ether; // Unrealistically high — will cause swap to fail
        uint256 sourceChainId = 11155111;
        uint256 nonce_ = 0;

        bytes32 messageHash =
            crossChainSwap.getMessageHash(user, wethAmount, minRitualOut, sourceChainId, nonce_);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        uint256 wethBefore = weth.balanceOf(user);
        crossChainSwap.bridgeAndSwap(payable(user), wethAmount, minRitualOut, sourceChainId, nonce_, signature);

        // Should have received WETH instead (fallback)
        assertEq(weth.balanceOf(user), wethBefore + wethAmount);
    }

    function test_CrossChainSwap_NonceTracking() public {
        bytes32 messageHash = crossChainSwap.getMessageHash(user, 1 ether, 0, 11155111, 0);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        crossChainSwap.bridgeAndSwap(payable(user), 1 ether, 0, 11155111, 0, signature);

        vm.expectRevert("CCS: nonce already processed");
        crossChainSwap.bridgeAndSwap(payable(user), 1 ether, 0, 11155111, 0, signature);
    }

    // ==================== Treasury Tests ====================

    function test_Treasury_ReceiveFees() public {
        vm.prank(user);
        (bool success,) = address(treasury).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(treasury.getBalance(), 1 ether);
    }

    function test_Treasury_WithdrawNative() public {
        vm.deal(address(treasury), 5 ether);
        uint256 balBefore = deployer.balance;

        vm.prank(deployer);
        treasury.withdrawNative(payable(deployer), 3 ether);
        assertEq(deployer.balance, balBefore + 3 ether);
    }

    function test_Treasury_WithdrawToken() public {
        vm.prank(deployer);
        weth.mint(address(treasury), 10 ether);

        vm.prank(deployer);
        treasury.withdrawToken(address(weth), deployer, 5 ether);
        assertEq(weth.balanceOf(deployer), 5 ether);
    }

    // ==================== Integration: Full Bridge+Swap Flow ====================

    function test_Integration_FullBridgeAndManualSwap() public {
        // Simulate Path 1: Bridge ETH → WETH, then swap WETH → RITUAL

        // Step 1: User locks ETH (simulated on source chain)
        vm.prank(user);
        bridgeLock.lockETH{value: 20 ether}(1979, user, false);

        // Step 2: Relayer mints WETH on Ritual
        bytes32 messageHash = bridgeMint.getMintMessageHash(user, 20 ether, 11155111, 0);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);
        bridgeMint.mintWETH(user, 20 ether, 11155111, 0, abi.encodePacked(r, s, v));
        assertEq(weth.balanceOf(user), 70 ether); // 50 + 20

        // Step 3: User swaps WETH → RITUAL on DEX
        uint256 ritualBefore = user.balance;
        vm.startPrank(user);
        weth.approve(address(router), 20 ether);
        uint256 ritualOut = router.swapExactWETHForRITUAL(20 ether, 0);
        vm.stopPrank();

        assertGt(ritualOut, 0);
        assertEq(user.balance, ritualBefore + ritualOut);
    }

    function test_Integration_DirectCrossChainSwap() public {
        // Simulate Path 2: Direct ETH → RITUAL

        // Step 1: User locks ETH with directSwap=true
        vm.prank(user);
        bridgeLock.lockETH{value: 20 ether}(1979, user, true);

        // Step 2: Relayer calls CrossChainSwap
        bytes32 messageHash = crossChainSwap.getMessageHash(user, 20 ether, 0, 11155111, 0);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);

        uint256 ritualBefore = user.balance;
        crossChainSwap.bridgeAndSwap(payable(user), 20 ether, 0, 11155111, 0, abi.encodePacked(r, s, v));

        assertGt(user.balance, ritualBefore);
    }

    function test_Integration_ReturnTrip() public {
        // Simulate return: RITUAL → WETH → ETH

        // Step 1: User swaps RITUAL → WETH on Ritual DEX
        vm.prank(user);
        uint256 wethOut = router.swapExactRITUALForWETH{value: 1 ether}(0);
        assertGt(wethOut, 0);

        // Step 2: User burns WETH for return trip
        vm.startPrank(user);
        weth.approve(address(bridgeMint), wethOut);
        bridgeMint.burnWETH(wethOut, 11155111);
        vm.stopPrank();

        // Step 3: Relayer unlocks ETH on source chain
        vm.deal(address(bridgeLock), 100 ether);
        bytes32 messageHash = bridgeLock.getMessageHash(user, wethOut, 0, block.chainid);
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(relayerPrivateKey, ethSignedHash);

        uint256 ethBefore = user.balance;
        bridgeLock.unlockETH(payable(user), wethOut, 0, abi.encodePacked(r, s, v));
        assertEq(user.balance, ethBefore + wethOut);
    }
}
