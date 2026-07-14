// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../tokens/WETH.sol";

/// @title BridgeMint - Ritual Chain Bridge Contract
/// @notice Deployed on Ritual. Mints WETH when ETH is locked on source chains.
///         For return trips it ESCROWS WETH (rather than burning immediately) and
///         only burns once the relayer confirms ETH was unlocked on the source chain.
///         If the unlock never settles, the user can reclaim their WETH after a timeout.
/// @dev Fixes vs v1:
///      - Return escrow + reclaim so burned WETH can never be lost when the source
///        BridgeLock is under-funded (was the critical insolvency bug).
///      - Mint replay protection keyed by (sourceChainId, nonce), not nonce alone.
///      - Signed mint messages bind address(this) + block.chainid (anti-replay on redeploy).
contract BridgeMint is AccessControl, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @dev Ritual's block.timestamp is denominated in MILLISECONDS. 1 hour = 3_600_000 ms.
    uint256 public constant RETURN_TIMEOUT = 3_600_000;

    WETH public immutable weth;
    address public relayer;
    uint256 public nonce; // nonce for return (burn) events

    // Mint replay protection, keyed by keccak256(sourceChainId, sourceNonce).
    mapping(bytes32 => bool) public processedMints;

    struct PendingReturn {
        address user;
        uint256 amount;
        uint256 destinationChainId;
        uint256 initiatedAt; // ms (Ritual)
        bool settled;
    }
    // Escrowed returns, keyed by return nonce.
    mapping(uint256 => PendingReturn) public pendingReturns;

    event Minted(address indexed recipient, uint256 amount, uint256 sourceChainId, uint256 nonce);
    // Kept for relayer/event compatibility — emitted when a return is initiated (WETH escrowed).
    event BurnForUnlock(address indexed sender, uint256 amount, uint256 destinationChainId, uint256 nonce);
    event ReturnFinalized(uint256 indexed nonce, uint256 amount);
    event ReturnReclaimed(address indexed user, uint256 amount, uint256 nonce);

    constructor(address _weth, address _relayer, address admin) {
        require(_weth != address(0) && _relayer != address(0), "BridgeMint: zero address");
        weth = WETH(_weth);
        relayer = _relayer;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    // ==================== Forward: Mint ====================

    /// @notice Mint WETH to recipient (called by relayer after ETH is locked on source chain)
    function mintWETH(
        address recipient,
        uint256 amount,
        uint256 sourceChainId,
        uint256 _nonce,
        bytes calldata signature
    ) external whenNotPaused {
        bytes32 mintKey = keccak256(abi.encode(sourceChainId, _nonce));
        require(!processedMints[mintKey], "BridgeMint: mint already processed");
        require(recipient != address(0), "BridgeMint: zero recipient");
        require(amount > 0, "BridgeMint: zero amount");

        bytes32 messageHash = getMintMessageHash(recipient, amount, sourceChainId, _nonce);
        require(verify(messageHash, signature), "BridgeMint: invalid signature");

        processedMints[mintKey] = true;
        weth.mint(recipient, amount);

        emit Minted(recipient, amount, sourceChainId, _nonce);
    }

    // ==================== Return: Escrow → Finalize/Reclaim ====================

    /// @notice Initiate a return trip. Escrows WETH (does NOT burn yet) and emits an event
    ///         so the relayer can unlock ETH on the destination chain. Once the relayer
    ///         confirms the unlock it calls finalizeReturn to burn the escrow. If the unlock
    ///         never settles, the user reclaims via reclaimReturn after RETURN_TIMEOUT.
    /// @dev Name kept as burnWETH for frontend compatibility; behaviour is escrow-then-burn.
    function burnWETH(uint256 amount, uint256 destinationChainId) external nonReentrant whenNotPaused {
        require(amount > 0, "BridgeMint: zero amount");

        // Escrow the user's WETH in this contract (requires prior approval).
        require(weth.transferFrom(msg.sender, address(this), amount), "BridgeMint: transfer failed");

        uint256 currentNonce = nonce;
        nonce++;
        pendingReturns[currentNonce] = PendingReturn({
            user: msg.sender,
            amount: amount,
            destinationChainId: destinationChainId,
            initiatedAt: block.timestamp,
            settled: false
        });

        emit BurnForUnlock(msg.sender, amount, destinationChainId, currentNonce);
    }

    /// @notice Relayer finalizes a return after ETH has been unlocked on the source chain.
    ///         Burns the escrowed WETH, preserving the WETH↔locked-ETH invariant.
    function finalizeReturn(uint256 _nonce) external onlyRole(RELAYER_ROLE) nonReentrant {
        PendingReturn storage r = pendingReturns[_nonce];
        require(r.amount > 0 && !r.settled, "BridgeMint: not finalizable");
        r.settled = true;
        weth.burn(r.amount); // burns from this contract's escrow balance
        emit ReturnFinalized(_nonce, r.amount);
    }

    /// @notice User reclaims escrowed WETH if the return was never finalized within the timeout
    ///         (e.g. the source BridgeLock had no liquidity). Guarantees no fund loss.
    function reclaimReturn(uint256 _nonce) external nonReentrant {
        PendingReturn storage r = pendingReturns[_nonce];
        require(r.user == msg.sender, "BridgeMint: not your return");
        require(!r.settled, "BridgeMint: already settled");
        require(block.timestamp >= r.initiatedAt + RETURN_TIMEOUT, "BridgeMint: too early");
        r.settled = true;
        require(weth.transfer(r.user, r.amount), "BridgeMint: refund failed");
        emit ReturnReclaimed(r.user, r.amount, _nonce);
    }

    // ==================== Signatures ====================

    /// @notice Mint message hash, bound to this contract + this chain to prevent replay.
    function getMintMessageHash(address recipient, uint256 amount, uint256 sourceChainId, uint256 _nonce)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(recipient, amount, sourceChainId, _nonce, address(this), block.chainid));
    }

    function verify(bytes32 messageHash, bytes calldata signature) public view returns (bool) {
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        return signer == relayer;
    }

    // ==================== Admin ====================

    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    function setRelayer(address _relayer) external onlyRole(ADMIN_ROLE) {
        require(_relayer != address(0), "BridgeMint: zero relayer");
        _revokeRole(RELAYER_ROLE, relayer);
        relayer = _relayer;
        _grantRole(RELAYER_ROLE, _relayer);
    }
}
