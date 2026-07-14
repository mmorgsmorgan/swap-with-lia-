// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../tokens/WETH.sol";

interface ISwapRouter {
    function swapExactWETHForRITUAL(uint256 amountIn, uint256 minAmountOut) external returns (uint256);
}

/// @title CrossChainSwap - Atomic Bridge + Swap on Ritual
/// @notice Called by relayer when directSwap=true. Atomically mints WETH,
///         swaps to native RITUAL via the DEX, and delivers to user.
///         Falls back to delivering WETH if the swap fails.
contract CrossChainSwap is AccessControl, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    WETH public immutable weth;
    address public immutable swapRouter;
    address public relayer;
    // Replay protection keyed by keccak256(sourceChainId, nonce) — NOT nonce alone,
    // so the same nonce from two different source chains can't collide.
    mapping(bytes32 => bool) public processedSwaps;

    event CrossChainSwapExecuted(
        address indexed recipient,
        uint256 wethAmount,
        uint256 ritualOut,
        uint256 sourceChainId,
        uint256 nonce
    );

    event CrossChainSwapFallback(
        address indexed recipient,
        uint256 wethAmount,
        uint256 sourceChainId,
        uint256 nonce,
        string reason
    );

    /// @param _weth WETH token address
    /// @param _swapRouter SwapRouter address
    /// @param _relayer Trusted relayer address
    /// @param admin Admin address
    constructor(address _weth, address _swapRouter, address _relayer, address admin) {
        require(_weth != address(0) && _swapRouter != address(0) && _relayer != address(0), "CCS: zero address");
        weth = WETH(_weth);
        swapRouter = _swapRouter;
        relayer = _relayer;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    /// @notice Atomic bridge + swap: mint WETH → swap to RITUAL → deliver to user
    /// @param recipient Address to receive native RITUAL (or WETH on fallback)
    /// @param wethAmount Amount of WETH to mint and swap
    /// @param minRitualOut Minimum RITUAL output (slippage protection)
    /// @param sourceChainId Chain where ETH was locked
    /// @param _nonce Unique nonce from lock event
    /// @param signature Relayer's signature
    function bridgeAndSwap(
        address payable recipient,
        uint256 wethAmount,
        uint256 minRitualOut,
        uint256 sourceChainId,
        uint256 _nonce,
        bytes calldata signature
    ) external nonReentrant {
        bytes32 swapKey = keccak256(abi.encode(sourceChainId, _nonce));
        require(!processedSwaps[swapKey], "CCS: nonce already processed");
        require(recipient != address(0), "CCS: zero recipient");
        require(wethAmount > 0, "CCS: zero amount");

        bytes32 messageHash = getMessageHash(recipient, wethAmount, minRitualOut, sourceChainId, _nonce);
        require(verify(messageHash, signature), "CCS: invalid signature");

        processedSwaps[swapKey] = true;

        // Step 1: Mint WETH to this contract
        weth.mint(address(this), wethAmount);

        // Step 2: Approve SwapRouter to spend WETH
        IERC20(address(weth)).approve(swapRouter, wethAmount);

        // Step 3: Try to swap WETH → RITUAL
        try ISwapRouter(swapRouter).swapExactWETHForRITUAL(wethAmount, minRitualOut) returns (uint256 ritualOut) {
            // Step 4: Transfer native RITUAL to recipient
            (bool success,) = recipient.call{value: ritualOut}("");
            require(success, "CCS: RITUAL transfer failed");

            emit CrossChainSwapExecuted(recipient, wethAmount, ritualOut, sourceChainId, _nonce);
        } catch Error(string memory reason) {
            // Swap failed — fallback: deliver WETH to user instead
            IERC20(address(weth)).safeTransfer(recipient, wethAmount);
            emit CrossChainSwapFallback(recipient, wethAmount, sourceChainId, _nonce, reason);
        } catch {
            // Swap failed with unknown error — fallback
            IERC20(address(weth)).safeTransfer(recipient, wethAmount);
            emit CrossChainSwapFallback(recipient, wethAmount, sourceChainId, _nonce, "Unknown swap error");
        }
    }

    /// @notice Compute message hash for signature verification
    function getMessageHash(
        address recipient,
        uint256 wethAmount,
        uint256 minRitualOut,
        uint256 sourceChainId,
        uint256 _nonce
    ) public view returns (bytes32) {
        return keccak256(abi.encode(recipient, wethAmount, minRitualOut, sourceChainId, _nonce, address(this), block.chainid));
    }

    /// @notice Verify relayer signature
    function verify(bytes32 messageHash, bytes calldata signature) public view returns (bool) {
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        return signer == relayer;
    }

    function setRelayer(address _relayer) external onlyRole(ADMIN_ROLE) {
        require(_relayer != address(0), "CCS: zero relayer");
        _revokeRole(RELAYER_ROLE, relayer);
        relayer = _relayer;
        _grantRole(RELAYER_ROLE, _relayer);
    }

    /// @dev Accept native RITUAL from SwapRouter
    receive() external payable {}
}
