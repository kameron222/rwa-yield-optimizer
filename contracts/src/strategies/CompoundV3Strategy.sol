// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BaseStrategy} from "./BaseStrategy.sol";
import {IComet} from "../interfaces/ICompoundV3.sol";

/// @title CompoundV3Strategy
/// @notice Deposits USDC into Compound V3 (Comet) on Base.
///         Interest auto-compounds inside Comet — the position's value grows over time.
///
/// Base mainnet addresses
///   Comet (USDC): 0xb125E6687d4313864e53df431d5425969c15Eb2F  (native USDC market)
contract CompoundV3Strategy is BaseStrategy {
    using SafeERC20 for IERC20;

    // ── Constants ───────────────────────────────────────────────────────────
    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant RATE_SCALE = 1e18;
    uint256 private constant BPS_SCALE  = 10_000;

    // ── Immutables ──────────────────────────────────────────────────────────
    IComet public immutable comet;

    // ── Events ──────────────────────────────────────────────────────────────
    event Deposited(uint256 amount);
    event Withdrawn(uint256 requested, uint256 received);
    event Harvested(uint256 yield);

    constructor(
        address _usdc,
        address _vault,
        address _comet
    ) BaseStrategy(_usdc, _vault, "Compound V3 USDC Strategy") {
        comet = IComet(_comet);
        IERC20(_usdc).forceApprove(_comet, type(uint256).max);
    }

    // ── IStrategy ───────────────────────────────────────────────────────────

    function totalAssets() public view override returns (uint256) {
        return comet.balanceOf(address(this));
    }

    /// @notice Converts Comet's per-second supply rate to annual APY in bps.
    ///         supplyRate is scaled by 1e18; annual = rate * SECONDS_PER_YEAR.
    function estimatedAPY() external view override returns (uint256 bps) {
        uint256 utilization  = comet.getUtilization();
        uint64  supplyRate   = comet.getSupplyRate(utilization);          // per-second, 1e18 scale
        uint256 annualRate   = uint256(supplyRate) * SECONDS_PER_YEAR;    // still 1e18 scaled
        bps = annualRate * BPS_SCALE / RATE_SCALE;
    }

    // ── Internal ────────────────────────────────────────────────────────────

    function _deposit(uint256 amount) internal override {
        comet.supply(asset, amount);
        emit Deposited(amount);
    }

    function _withdraw(uint256 amount) internal override returns (uint256 received) {
        uint256 before = IERC20(asset).balanceOf(address(this));
        comet.withdraw(asset, amount);
        received = IERC20(asset).balanceOf(address(this)) - before;
        emit Withdrawn(amount, received);
    }

    function _withdrawAll() internal override returns (uint256 received) {
        uint256 balance = comet.balanceOf(address(this));
        if (balance < 1) return 0;
        uint256 before = IERC20(asset).balanceOf(address(this));
        comet.withdraw(asset, balance);
        received = IERC20(asset).balanceOf(address(this)) - before;
        emit Withdrawn(balance, received);
    }

    /// @notice Compound V3 auto-compounds. Yield = current balance − principal.
    function _harvest() internal override returns (uint256 harvested) {
        uint256 current = comet.balanceOf(address(this));
        if (current > totalDeposited) {
            harvested = current - totalDeposited;
            uint256 before = IERC20(asset).balanceOf(address(this));
            comet.withdraw(asset, harvested);
            harvested = IERC20(asset).balanceOf(address(this)) - before;
        }
        emit Harvested(harvested);
    }
}
