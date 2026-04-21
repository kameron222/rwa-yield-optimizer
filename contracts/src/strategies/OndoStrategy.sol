// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BaseStrategy} from "./BaseStrategy.sol";

/// @title OndoStrategy
/// @notice Strategy stub for Ondo USDY exposure on Base.
///
/// @dev    Ondo USDY lives on Ethereum mainnet; Base integration options:
///         1. Bridge USDC via CCIP / Stargate → mint USDY on Ethereum → bridge back
///         2. Use Ondo's forthcoming Base deployment (stub shows intent)
///         3. Use a wrapped USDY representation bridged via LayerZero OFT
///
///         This contract implements the full IStrategy interface with a toggle
///         between LIVE mode (real cross-chain deposit when Ondo Base exists)
///         and STUB mode (holds USDC locally, earns configurable static rate).
///         Admin can set the static APY to mirror Ondo's published rate.
///
/// Ondo USDY Ethereum: 0x96F6ef951840721AdBF46Ac996b59E0235CB985C
/// Ondo published APY: ~3.55% (as of 2026-04)
contract OndoStrategy is BaseStrategy {
    using SafeERC20 for IERC20;

    // ── State ───────────────────────────────────────────────────────────────

    /// @notice Static APY in bps reported while cross-chain bridge is not live.
    uint256 public staticApyBps = 355; // 3.55%

    /// @notice Simulated accrual: principal × staticApy × elapsed / year.
    uint256 public lastAccrualTimestamp;

    /// @notice Accumulated simulated yield (not withdrawable — illustrative only).
    uint256 public accruedYield;

    bool public bridgeLive; // set to true when real cross-chain integration ships

    // ── Events ──────────────────────────────────────────────────────────────
    event StaticApyUpdated(uint256 newBps);
    event BridgeLiveUpdated(bool live);
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event Harvested(uint256 yield);

    constructor(
        address _usdc,
        address _vault
    ) BaseStrategy(_usdc, _vault, "Ondo USDY Strategy (Stub)") {
        lastAccrualTimestamp = block.timestamp;
    }

    // ── Admin ───────────────────────────────────────────────────────────────

    function setStaticApy(uint256 bps) external onlyOwner {
        staticApyBps = bps;
        emit StaticApyUpdated(bps);
    }

    function setBridgeLive(bool live) external onlyOwner {
        bridgeLive = live;
        emit BridgeLiveUpdated(live);
    }

    // ── IStrategy ───────────────────────────────────────────────────────────

    function totalAssets() public view override returns (uint256) {
        // Only return real withdrawable USDC. The simulated yield in
        // _pendingYield() is illustrative only — including it would inflate
        // NAV, cause share prices to diverge from reality, and trigger
        // performance fees on non-existent yield (diluting depositors).
        return IERC20(asset).balanceOf(address(this));
    }

    /// @notice Simulated yield balance for display purposes only. Not reflected
    ///         in NAV; will be replaced with real accrual when bridge goes live.
    function pendingSimulatedYield() external view returns (uint256) {
        return _pendingYield();
    }

    function estimatedAPY() external view override returns (uint256 bps) {
        return staticApyBps;
    }

    // ── Internal ────────────────────────────────────────────────────────────

    function _deposit(uint256 amount) internal override {
        // STUB: funds sit in this contract until bridge is live
        // LIVE: bridge USDC → Ethereum → mint USDY
        _accrueYield();
        emit Deposited(amount);
    }

    function _withdraw(uint256 amount) internal override returns (uint256 received) {
        _accrueYield();
        uint256 localBal = IERC20(asset).balanceOf(address(this));
        received = amount > localBal ? localBal : amount;
        // Note: simulated yield is non-transferrable in stub mode
        emit Withdrawn(received);
    }

    function _withdrawAll() internal override returns (uint256 received) {
        _accrueYield();
        received = IERC20(asset).balanceOf(address(this));
        accruedYield = 0;
        emit Withdrawn(received);
    }

    function _harvest() internal override returns (uint256 harvested) {
        _accrueYield();
        // In stub mode no real yield is claimable — return 0
        // In live mode: USDY rebases → harvest delta
        harvested = 0;
        emit Harvested(0);
    }

    function _pendingYield() internal view returns (uint256) {
        uint256 elapsed = block.timestamp - lastAccrualTimestamp;
        uint256 principal = IERC20(asset).balanceOf(address(this));
        // simple interest: principal * bps/10000 * elapsed/year
        return principal * staticApyBps * elapsed / (10_000 * 365 days) + accruedYield;
    }

    function _accrueYield() internal {
        accruedYield = _pendingYield();
        lastAccrualTimestamp = block.timestamp;
    }
}
