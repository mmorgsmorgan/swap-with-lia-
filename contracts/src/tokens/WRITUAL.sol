// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title WRITUAL - Wrapped RITUAL
/// @notice WETH-style wrapper for native RITUAL token. Allows native RITUAL
///         to be used as ERC20 in AMM pools. Anyone can wrap/unwrap freely.
contract WRITUAL is ERC20 {
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    constructor() ERC20("Wrapped RITUAL", "WRITUAL") {}

    /// @notice Wrap native RITUAL into WRITUAL ERC20
    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Unwrap WRITUAL back to native RITUAL
    /// @param amount Amount to unwrap
    function withdraw(uint256 amount) public {
        require(balanceOf(msg.sender) >= amount, "WRITUAL: insufficient balance");
        _burn(msg.sender, amount);
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "WRITUAL: RITUAL transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    receive() external payable {
        deposit();
    }

    fallback() external payable {
        deposit();
    }
}
