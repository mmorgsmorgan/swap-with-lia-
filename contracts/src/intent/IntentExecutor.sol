// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title IntentExecutor - Multi-step Operation Coordinator
/// @notice Executes multi-step DeFi operations atomically for the AI agent.
///         Supports approve, swap, bridge, wrap/unwrap sequences.
contract IntentExecutor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    enum StepType {
        APPROVE,
        CALL,
        TRANSFER,
        TRANSFER_NATIVE
    }

    struct IntentStep {
        StepType stepType;
        address target;
        uint256 value;
        bytes data;
    }

    event IntentExecuted(address indexed sender, uint256 stepsCompleted, bool success);
    event StepExecuted(uint256 indexed stepIndex, StepType stepType, address target, bool success);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(EXECUTOR_ROLE, admin);
    }

    /// @notice Execute a sequence of intent steps
    /// @param steps Array of steps to execute
    function executeIntent(IntentStep[] calldata steps) external payable nonReentrant onlyRole(EXECUTOR_ROLE) {
        uint256 completed = 0;
        for (uint256 i = 0; i < steps.length; i++) {
            IntentStep calldata step = steps[i];

            if (step.stepType == StepType.APPROVE) {
                // Approve a token spend
                IERC20(step.target).approve(abi.decode(step.data, (address)), step.value);
                emit StepExecuted(i, step.stepType, step.target, true);
            } else if (step.stepType == StepType.CALL) {
                // Generic contract call
                (bool success,) = step.target.call{value: step.value}(step.data);
                require(success, "IntentExecutor: call failed");
                emit StepExecuted(i, step.stepType, step.target, success);
            } else if (step.stepType == StepType.TRANSFER) {
                // ERC20 transfer
                (address to, uint256 amount) = abi.decode(step.data, (address, uint256));
                IERC20(step.target).safeTransfer(to, amount);
                emit StepExecuted(i, step.stepType, step.target, true);
            } else if (step.stepType == StepType.TRANSFER_NATIVE) {
                // Native token transfer
                (bool success,) = step.target.call{value: step.value}("");
                require(success, "IntentExecutor: native transfer failed");
                emit StepExecuted(i, step.stepType, step.target, true);
            }
            completed++;
        }

        emit IntentExecuted(msg.sender, completed, true);
    }

    receive() external payable {}
}
