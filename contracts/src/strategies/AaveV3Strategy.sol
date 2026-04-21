// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BaseStrategy} from "./BaseStrategy.sol";
import {IAaveV3Pool, IAToken} from "../interfaces/IAaveV3.sol";

/// @title AaveV3Strategy
/// @notice Deposits USDC into Aave V3 on Base and earns supply-side interest.
///         APY is read live from Aave's reserve data (currentLiquidityRate).
///
/// Base mainnet addresses
///   Pool:   0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
///   aUSDC:  0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB
contract AaveV3Strategy is BaseStrategy {
    using SafeERC20 for IERC20;

    // ── Constants ───────────────────────────────────────────────────────────
    // Aave V3 stores currentLiquidityRate as an annualised ray (1e27 = 100% APY).
    uint256 private constant RAY = 1e27;

    // ── Immutables ──────────────────────────────────────────────────────────
    IAaveV3Pool public immutable pool;
    IAToken     public immutable aToken;

    // ── Events ──────────────────────────────────────────────────────────────
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount, uint256 received);
    event Harvested(uint256 yield);

    constructor(
        address _usdc,
        address _vault,
        address _pool,
        address _aToken
    ) BaseStrategy(_usdc, _vault, "Aave V3 USDC Strategy") {
        pool   = IAaveV3Pool(_pool);
        aToken = IAToken(_aToken);

        // Approve pool to spend USDC
        IERC20(_usdc).forceApprove(_pool, type(uint256).max);
    }

    // ── IStrategy ───────────────────────────────────────────────────────────

    /// @notice aToken balance is the fair value of deposited USDC + accrued interest.
    function totalAssets() public view override returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    /// @notice Returns Aave supply APY in basis points.
    ///         Aave stores currentLiquidityRate as a ray (1e27) per-second rate;
    ///         we convert to annual bps: rate * SECONDS_PER_YEAR / RAY * 10000.
    function estimatedAPY() external view override returns (uint256 bps) {
        IAaveV3Pool.ReserveData memory data = pool.getReserveData(asset);
        // currentLiquidityRate is already annualised as a ray fraction
        // APY ≈ rate / RAY * 10000 (in bps)
        bps = uint256(data.currentLiquidityRate) * 10_000 / RAY;
    }

    // ── Internal ────────────────────────────────────────────────────────────

    function _deposit(uint256 amount) internal override {
        pool.supply(asset, amount, address(this), 0);
        emit Deposited(amount);
    }

    function _withdraw(uint256 amount) internal override returns (uint256 received) {
        received = pool.withdraw(asset, amount, address(this));
        emit Withdrawn(amount, received);
    }

    function _withdrawAll() internal override returns (uint256 received) {
        uint256 balance = aToken.balanceOf(address(this));
        if (balance < 1) return 0;
        received = pool.withdraw(asset, type(uint256).max, address(this));
        emit Withdrawn(balance, received);
    }

    /// @notice Aave auto-compounds — yield is already reflected in aToken balance.
    ///         Harvest computes the delta over totalDeposited and returns it.
    function _harvest() internal override returns (uint256 harvested) {
        uint256 current = aToken.balanceOf(address(this));
        if (current > totalDeposited) {
            uint256 yieldAmount = current - totalDeposited;
            // Capture return value (actual USDC received) to satisfy Slither unused-return
            harvested = pool.withdraw(asset, yieldAmount, address(this));
        }
        emit Harvested(harvested);
    }
}
