// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title WETH - Wrapped ETH (Bridged) on Ritual
/// @notice Canonical bridged representation of ETH on Ritual chain.
///         Minted 1:1 when ETH is locked on source chains, burned for return trips.
/// @dev Only addresses with MINTER_ROLE (BridgeMint, CrossChainSwap) can mint.
contract WETH is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @param admin Address that receives DEFAULT_ADMIN_ROLE (can grant/revoke roles)
    constructor(address admin) ERC20("Wrapped ETH (Bridged)", "WETH") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Mint WETH tokens to a recipient
    /// @param to Recipient address
    /// @param amount Amount to mint (18 decimals)
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
