// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Treasury - Fee Collection Contract
/// @notice Collects swap fees and bridge fees. Admin can withdraw.
contract Treasury is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    event FeeReceived(address indexed from, uint256 amount);
    event FeeWithdrawn(address indexed token, address indexed to, uint256 amount);
    event NativeFeeWithdrawn(address indexed to, uint256 amount);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /// @notice Withdraw native token fees
    function withdrawNative(address payable to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Treasury: zero address");
        require(address(this).balance >= amount, "Treasury: insufficient balance");
        (bool success,) = to.call{value: amount}("");
        require(success, "Treasury: transfer failed");
        emit NativeFeeWithdrawn(to, amount);
    }

    /// @notice Withdraw ERC20 token fees
    function withdrawToken(address token, address to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Treasury: zero address");
        IERC20(token).safeTransfer(to, amount);
        emit FeeWithdrawn(token, to, amount);
    }

    /// @notice Get native token balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Get ERC20 token balance
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    receive() external payable {
        emit FeeReceived(msg.sender, msg.value);
    }
}
