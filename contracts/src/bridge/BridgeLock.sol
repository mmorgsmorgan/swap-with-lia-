// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title BridgeLock - Source Chain Bridge Contract
/// @notice Deployed on Ethereum Sepolia and Base Sepolia. Locks native ETH
///         for bridging to Ritual as WETH. Supports direct swap mode.
contract BridgeLock is AccessControl, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    address public relayer;
    uint256 public nonce;
    mapping(uint256 => bool) public processedNonces;

    event Locked(
        address indexed sender,
        uint256 amount,
        uint256 destinationChainId,
        address indexed recipient,
        uint256 nonce,
        bool directSwap
    );

    event Unlocked(address indexed recipient, uint256 amount, uint256 nonce);
    event UnlockInsufficientLiquidity(address indexed recipient, uint256 amount, uint256 nonce, uint256 available);

    /// @param _relayer Address of the trusted relayer
    /// @param admin Address that receives admin role
    constructor(address _relayer, address admin) {
        require(_relayer != address(0), "BridgeLock: zero relayer");
        relayer = _relayer;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    /// @notice Lock ETH for bridging to Ritual
    /// @param destinationChainId Target chain ID (1979 for Ritual)
    /// @param recipient Address to receive tokens on destination chain
    /// @param directSwap If true, relayer will atomically bridge+swap to RITUAL
    function lockETH(uint256 destinationChainId, address recipient, bool directSwap)
        external
        payable
        whenNotPaused
    {
        require(msg.value > 0, "BridgeLock: zero amount");
        require(recipient != address(0), "BridgeLock: zero recipient");

        uint256 currentNonce = nonce;
        nonce++;

        emit Locked(msg.sender, msg.value, destinationChainId, recipient, currentNonce, directSwap);
    }

    /// @notice Unlock ETH for return trips (called by relayer)
    /// @param recipient Address to receive ETH
    /// @param amount Amount of ETH to unlock
    /// @param _nonce Unique nonce for this unlock
    /// @param signature Relayer's signature over the message
    function unlockETH(address payable recipient, uint256 amount, uint256 _nonce, bytes calldata signature)
        external
        nonReentrant
    {
        require(!processedNonces[_nonce], "BridgeLock: nonce already processed");

        // Verify the relayer signature BEFORE the liquidity check so an under-funded
        // bridge surfaces as an explicit insolvency (event) rather than a bare revert.
        bytes32 messageHash = getMessageHash(recipient, amount, _nonce, block.chainid);
        require(verify(messageHash, signature), "BridgeLock: invalid signature");

        if (address(this).balance < amount) {
            emit UnlockInsufficientLiquidity(recipient, amount, _nonce, address(this).balance);
            revert("BridgeLock: insufficient liquidity - fund the bridge and retry");
        }

        processedNonces[_nonce] = true;

        (bool success,) = recipient.call{value: amount}("");
        require(success, "BridgeLock: ETH transfer failed");

        emit Unlocked(recipient, amount, _nonce);
    }

    /// @notice Compute message hash for signature verification.
    /// @dev Binds address(this) so a signature can't be replayed on another BridgeLock
    ///      deployment; chainId already prevents cross-source-chain replay.
    function getMessageHash(address recipient, uint256 amount, uint256 _nonce, uint256 chainId)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(recipient, amount, _nonce, chainId, address(this)));
    }

    /// @notice Verify that a message was signed by the relayer
    function verify(bytes32 messageHash, bytes calldata signature) public view returns (bool) {
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        return signer == relayer;
    }

    /// @notice Pause the bridge (emergency)
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the bridge
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Update relayer address
    function setRelayer(address _relayer) external onlyRole(ADMIN_ROLE) {
        require(_relayer != address(0), "BridgeLock: zero relayer");
        _revokeRole(RELAYER_ROLE, relayer);
        relayer = _relayer;
        _grantRole(RELAYER_ROLE, _relayer);
    }

    /// @dev Accept ETH to fund unlocks
    receive() external payable {}
}
