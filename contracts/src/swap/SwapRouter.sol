// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../tokens/WRITUAL.sol";

interface ILiquidityPool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
    function mint(address to) external returns (uint256);
    function burn(address to) external returns (uint256, uint256);
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external;
}

/// @title SwapRouter - AMM Router with Native RITUAL Handling
/// @notice Routes swaps through the WETH/WRITUAL pool. Automatically wraps/unwraps
///         native RITUAL so users never interact with WRITUAL directly.
contract SwapRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable weth;
    address public immutable writual;
    address public immutable pool;

    error InsufficientOutputAmount();
    error InsufficientLiquidity();
    error TransferFailed();

    constructor(address _weth, address _writual, address _pool) {
        weth = _weth;
        writual = _writual;
        pool = _pool;
    }

    /// @notice Add liquidity with ERC20 tokens (WETH + WRITUAL)
    /// @param amountWETH Amount of WETH to deposit
    /// @param amountWRITUAL Amount of WRITUAL to deposit
    /// @param minLiquidity Minimum LP tokens to receive
    /// @return liquidity LP tokens minted
    function addLiquidity(uint256 amountWETH, uint256 amountWRITUAL, uint256 minLiquidity)
        external
        nonReentrant
        returns (uint256 liquidity)
    {
        IERC20(weth).safeTransferFrom(msg.sender, pool, amountWETH);
        IERC20(writual).safeTransferFrom(msg.sender, pool, amountWRITUAL);
        liquidity = ILiquidityPool(pool).mint(msg.sender);
        require(liquidity >= minLiquidity, "Router: insufficient liquidity");
    }

    /// @notice Add liquidity with WETH + native RITUAL (auto-wraps RITUAL)
    /// @param amountWETH Amount of WETH to deposit
    /// @return liquidity LP tokens minted
    function addLiquidityRITUAL(uint256 amountWETH) external payable nonReentrant returns (uint256 liquidity) {
        require(msg.value > 0, "Router: no RITUAL sent");
        // Transfer WETH to pool
        IERC20(weth).safeTransferFrom(msg.sender, pool, amountWETH);
        // Wrap RITUAL → WRITUAL and send to pool
        WRITUAL(payable(writual)).deposit{value: msg.value}();
        IERC20(writual).safeTransfer(pool, msg.value);
        liquidity = ILiquidityPool(pool).mint(msg.sender);
    }

    /// @notice Remove liquidity and receive ERC20 tokens
    /// @param liquidity LP tokens to burn
    /// @param minAmountWETH Minimum WETH to receive
    /// @param minAmountWRITUAL Minimum WRITUAL to receive
    function removeLiquidity(uint256 liquidity, uint256 minAmountWETH, uint256 minAmountWRITUAL)
        external
        nonReentrant
        returns (uint256 amountWETH, uint256 amountWRITUAL)
    {
        IERC20(pool).safeTransferFrom(msg.sender, pool, liquidity);
        // Determine which is WETH and which is WRITUAL
        address _token0 = ILiquidityPool(pool).token0();
        (uint256 amount0, uint256 amount1) = ILiquidityPool(pool).burn(msg.sender);
        if (_token0 == weth) {
            amountWETH = amount0;
            amountWRITUAL = amount1;
        } else {
            amountWETH = amount1;
            amountWRITUAL = amount0;
        }
        require(amountWETH >= minAmountWETH && amountWRITUAL >= minAmountWRITUAL, "Router: insufficient amounts");
    }

    /// @notice Remove liquidity and receive WETH + native RITUAL (auto-unwraps)
    /// @param liquidity LP tokens to burn
    /// @param minAmountWETH Minimum WETH to receive
    /// @param minAmountRITUAL Minimum native RITUAL to receive
    function removeLiquidityRITUAL(uint256 liquidity, uint256 minAmountWETH, uint256 minAmountRITUAL)
        external
        nonReentrant
        returns (uint256 amountWETH, uint256 amountRITUAL)
    {
        IERC20(pool).safeTransferFrom(msg.sender, pool, liquidity);
        address _token0 = ILiquidityPool(pool).token0();
        // Burn LP tokens — receive to this contract so we can unwrap WRITUAL
        (uint256 amount0, uint256 amount1) = ILiquidityPool(pool).burn(address(this));
        uint256 amountWRITUAL;
        if (_token0 == weth) {
            amountWETH = amount0;
            amountWRITUAL = amount1;
        } else {
            amountWETH = amount1;
            amountWRITUAL = amount0;
        }
        // Send WETH to user
        IERC20(weth).safeTransfer(msg.sender, amountWETH);
        // Unwrap WRITUAL → RITUAL and send to user
        WRITUAL(payable(writual)).withdraw(amountWRITUAL);
        amountRITUAL = amountWRITUAL;
        (bool success,) = msg.sender.call{value: amountRITUAL}("");
        require(success, "Router: RITUAL transfer failed");
        require(amountWETH >= minAmountWETH && amountRITUAL >= minAmountRITUAL, "Router: insufficient amounts");
    }

    /// @notice Swap WETH → native RITUAL (wraps internally, swaps, unwraps)
    /// @param amountIn Amount of WETH to swap
    /// @param minAmountOut Minimum native RITUAL to receive
    /// @return amountOut Actual native RITUAL received
    function swapExactWETHForRITUAL(uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        address _token0 = ILiquidityPool(pool).token0();
        (uint112 r0, uint112 r1,) = ILiquidityPool(pool).getReserves();

        uint256 reserveIn;
        uint256 reserveOut;
        if (_token0 == weth) {
            reserveIn = r0;
            reserveOut = r1;
        } else {
            reserveIn = r1;
            reserveOut = r0;
        }

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut < minAmountOut) revert InsufficientOutputAmount();

        // Transfer WETH to pool
        IERC20(weth).safeTransferFrom(msg.sender, pool, amountIn);

        // Execute swap — receive WRITUAL to this contract
        if (_token0 == weth) {
            ILiquidityPool(pool).swap(0, amountOut, address(this));
        } else {
            ILiquidityPool(pool).swap(amountOut, 0, address(this));
        }

        // Unwrap WRITUAL → native RITUAL and send to caller
        WRITUAL(payable(writual)).withdraw(amountOut);
        (bool success,) = msg.sender.call{value: amountOut}("");
        require(success, "Router: RITUAL transfer failed");
    }

    /// @notice Swap native RITUAL → WETH (wraps RITUAL, swaps for WETH)
    /// @param minAmountOut Minimum WETH to receive
    /// @return amountOut Actual WETH received
    function swapExactRITUALForWETH(uint256 minAmountOut) external payable nonReentrant returns (uint256 amountOut) {
        require(msg.value > 0, "Router: no RITUAL sent");
        uint256 amountIn = msg.value;

        address _token0 = ILiquidityPool(pool).token0();
        (uint112 r0, uint112 r1,) = ILiquidityPool(pool).getReserves();

        uint256 reserveIn;
        uint256 reserveOut;
        if (_token0 == writual) {
            reserveIn = r0;
            reserveOut = r1;
        } else {
            reserveIn = r1;
            reserveOut = r0;
        }

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut < minAmountOut) revert InsufficientOutputAmount();

        // Wrap RITUAL → WRITUAL and send to pool
        WRITUAL(payable(writual)).deposit{value: amountIn}();
        IERC20(writual).safeTransfer(pool, amountIn);

        // Execute swap — receive WETH to caller
        if (_token0 == writual) {
            ILiquidityPool(pool).swap(0, amountOut, msg.sender);
        } else {
            ILiquidityPool(pool).swap(amountOut, 0, msg.sender);
        }
    }

    /// @notice Generic ERC20↔ERC20 swap through the pool
    /// @param tokenIn Input token address
    /// @param tokenOut Output token address  
    /// @param amountIn Amount of input token
    /// @param minAmountOut Minimum output amount
    /// @return amountOut Actual output received
    function swapExactTokensForTokens(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        address _token0 = ILiquidityPool(pool).token0();
        (uint112 r0, uint112 r1,) = ILiquidityPool(pool).getReserves();

        uint256 reserveIn;
        uint256 reserveOut;
        if (tokenIn == _token0) {
            reserveIn = r0;
            reserveOut = r1;
        } else {
            reserveIn = r1;
            reserveOut = r0;
        }

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut < minAmountOut) revert InsufficientOutputAmount();

        IERC20(tokenIn).safeTransferFrom(msg.sender, pool, amountIn);

        if (tokenIn == _token0) {
            ILiquidityPool(pool).swap(0, amountOut, msg.sender);
        } else {
            ILiquidityPool(pool).swap(amountOut, 0, msg.sender);
        }
    }

    /// @notice Calculate output amount using constant product formula with 0.3% fee
    /// @param amountIn Input amount
    /// @param reserveIn Reserve of input token
    /// @param reserveOut Reserve of output token
    /// @return amountOut Output amount
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Router: insufficient input");
        require(reserveIn > 0 && reserveOut > 0, "Router: insufficient liquidity");
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @notice Get current pool reserves ordered as (WETH, WRITUAL)
    function getPoolReserves() external view returns (uint256 reserveWETH, uint256 reserveWRITUAL) {
        address _token0 = ILiquidityPool(pool).token0();
        (uint112 r0, uint112 r1,) = ILiquidityPool(pool).getReserves();
        if (_token0 == weth) {
            reserveWETH = r0;
            reserveWRITUAL = r1;
        } else {
            reserveWETH = r1;
            reserveWRITUAL = r0;
        }
    }

    /// @notice Preview: how much RITUAL for given WETH input
    function getQuoteWETHToRITUAL(uint256 amountWETHIn) external view returns (uint256 ritualOut) {
        address _token0 = ILiquidityPool(pool).token0();
        (uint112 r0, uint112 r1,) = ILiquidityPool(pool).getReserves();
        if (_token0 == weth) {
            ritualOut = getAmountOut(amountWETHIn, r0, r1);
        } else {
            ritualOut = getAmountOut(amountWETHIn, r1, r0);
        }
    }

    /// @notice Preview: how much WETH for given RITUAL input
    function getQuoteRITUALToWETH(uint256 amountRITUALIn) external view returns (uint256 wethOut) {
        address _token0 = ILiquidityPool(pool).token0();
        (uint112 r0, uint112 r1,) = ILiquidityPool(pool).getReserves();
        if (_token0 == writual) {
            wethOut = getAmountOut(amountRITUALIn, r0, r1);
        } else {
            wethOut = getAmountOut(amountRITUALIn, r1, r0);
        }
    }

    /// @dev Accept native RITUAL from WRITUAL withdrawals
    receive() external payable {}
}
