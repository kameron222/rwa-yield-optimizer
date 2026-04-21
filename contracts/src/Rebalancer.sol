// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IStrategy}             from "./interfaces/IStrategy.sol";
import {RWAVault}              from "./RWAVault.sol";

/// @title  Rebalancer
/// @notice Off-chain keeper calls `shouldRebalance()` / `rebalance()` to rotate
///         capital between strategies based on APY, risk, and liquidity scores.
///
///         Scoring weights (configurable by owner):
///           70 % APY   — higher estimated APY → higher weight
///           20 % risk  — lower risk tier  → higher score (riskScore set per strategy)
///           10 % liquidity — higher liquidity score → higher weight
///
///         Rebalance is skipped if:
///           • Less than `rebalanceCooldown` seconds since last rebalance, OR
///           • The maximum allocation delta between ideal and actual is < `deltaThresholdBps`
///
/// @dev    This contract only computes weights and calls `RWAVault.setAllocation` +
///         `RWAVault.rebalance()`. It never holds funds.
contract Rebalancer is Ownable2Step, ReentrancyGuard {

    // ── Config ────────────────────────────────────────────────────────────────

    RWAVault public immutable vault;

    uint256 public weightApy       = 70;  // out of 100
    uint256 public weightRisk      = 20;
    uint256 public weightLiquidity = 10;

    uint256 public rebalanceCooldown   = 24 hours;
    uint256 public deltaThresholdBps   = 50;   // 0.5 %

    uint256 public lastRebalanceTime;

    /// @notice Per-strategy supplemental scores (set by owner, 0-100).
    mapping(address => uint256) public riskScore;      // 100 = lowest risk
    mapping(address => uint256) public liquidityScore; // 100 = most liquid

    // ── Events ────────────────────────────────────────────────────────────────
    event Rebalanced(uint256 timestamp, address[] strategies, uint256[] newAllocations);
    event WeightsUpdated(uint256 apy, uint256 risk, uint256 liquidity);
    event StrategyScoreUpdated(address indexed strategy, uint256 riskScore, uint256 liquidityScore);
    event CooldownUpdated(uint256 newCooldown);
    event DeltaThresholdUpdated(uint256 newBps);

    // ── Errors ────────────────────────────────────────────────────────────────
    error TooSoon();
    error NoBelowThreshold();
    error InvalidWeights();
    error ScoreOutOfRange();

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address _vault) Ownable(msg.sender) {
        vault = RWAVault(_vault);
    }

    /// @notice Accept ownership of the vault after a transferOwnership() call.
    ///         Call this after `vault.transferOwnership(address(rebalancer))`.
    function acceptVaultOwnership() external onlyOwner {
        vault.acceptOwnership();
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setWeights(uint256 apy, uint256 risk, uint256 liquidity) external onlyOwner {
        if (apy + risk + liquidity != 100) revert InvalidWeights();
        weightApy       = apy;
        weightRisk      = risk;
        weightLiquidity = liquidity;
        emit WeightsUpdated(apy, risk, liquidity);
    }

    function setStrategyScores(address strategy, uint256 newRiskScore, uint256 newLiquidityScore) external onlyOwner {
        if (newRiskScore > 100 || newLiquidityScore > 100) revert ScoreOutOfRange();
        riskScore[strategy]      = newRiskScore;
        liquidityScore[strategy] = newLiquidityScore;
        emit StrategyScoreUpdated(strategy, newRiskScore, newLiquidityScore);
    }

    function setCooldown(uint256 seconds_) external onlyOwner {
        rebalanceCooldown = seconds_;
        emit CooldownUpdated(seconds_);
    }

    function setDeltaThreshold(uint256 bps) external onlyOwner {
        deltaThresholdBps = bps;
        emit DeltaThresholdUpdated(bps);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// @notice Returns (strategies, idealAllocations, currentAllocations, maxDelta).
    function computeIdealAllocations() public view returns (
        address[] memory strats,
        uint256[] memory ideal,
        uint256[] memory current,
        uint256 maxDelta
    ) {
        // Capture all 3 return values (Slither: unused-return on partial discard)
        uint256[] memory stratAssets;
        (strats, current, stratAssets) = vault.strategyDetails();
        uint256 len = stratAssets.length; // same as strats.length; uses the captured array
        if (len == 0) return (strats, new uint256[](0), new uint256[](0), 0);

        // 1. Compute raw composite score per strategy
        uint256[] memory scores = new uint256[](len);
        uint256   totalScore = 0; // explicit init (Slither: uninitialized-local)

        for (uint256 i; i < len; ) {
            uint256 apyBps = IStrategy(strats[i]).estimatedAPY(); // e.g. 500 = 5 %
            uint256 risk   = riskScore[strats[i]];       // 0-100
            uint256 liq    = liquidityScore[strats[i]];  // 0-100

            // Defer division to avoid divide-before-multiply (Slither: divide-before-multiply).
            // Multiply weightApy into the numerator BEFORE dividing by 2000:
            //   apyContrib = min(apyBps, 2000) * 100 * weightApy / 2000
            uint256 apyContrib = apyBps > 2000
                ? 100 * weightApy
                : apyBps * 100 * weightApy / 2000;

            scores[i]  = apyContrib + risk * weightRisk + liq * weightLiquidity;
            totalScore += scores[i];
            unchecked { ++i; }
        }

        // 2. Convert scores → allocations summing to 10 000 bps
        ideal = new uint256[](len);
        uint256 allocated = 0; // explicit init (Slither: uninitialized-local)
        if (totalScore == 0) {
            // Uniform distribution
            uint256 each = 10_000 / len;
            for (uint256 i; i < len; ) { ideal[i] = each; allocated += each; unchecked { ++i; } }
        } else {
            for (uint256 i; i < len; ) {
                ideal[i]   = scores[i] * 10_000 / totalScore;
                allocated += ideal[i];
                unchecked { ++i; }
            }
        }

        // Assign remainder to highest scorer (index 0 if all equal)
        if (allocated < 10_000 && len > 0) ideal[0] += 10_000 - allocated;

        // 3. Compute max delta
        for (uint256 i; i < len; ) {
            uint256 cur   = current[i];
            uint256 id    = ideal[i];
            uint256 delta = cur > id ? cur - id : id - cur;
            if (delta > maxDelta) maxDelta = delta;
            unchecked { ++i; }
        }
    }

    /// @notice Returns true when a rebalance should be executed.
    function shouldRebalance() external view returns (bool) {
        if (block.timestamp < lastRebalanceTime + rebalanceCooldown) return false;
        (, , , uint256 maxDelta) = computeIdealAllocations();
        return maxDelta >= deltaThresholdBps;
    }

    // ── Rebalance ─────────────────────────────────────────────────────────────

    /// @notice Execute the rebalance: update vault allocations then call vault.rebalance().
    function rebalance() external onlyOwner nonReentrant {
        if (block.timestamp < lastRebalanceTime + rebalanceCooldown) revert TooSoon();

        (address[] memory strats, uint256[] memory ideal, , uint256 maxDelta)
            = computeIdealAllocations();

        if (maxDelta < deltaThresholdBps) revert NoBelowThreshold();

        // CEI: update state BEFORE external calls
        lastRebalanceTime = block.timestamp;

        // Zero all allocations first to avoid intermediate cap violations
        uint256 len = strats.length;
        for (uint256 i; i < len; ) {
            vault.setAllocation(strats[i], 0);
            unchecked { ++i; }
        }
        // Set new allocations
        for (uint256 i; i < len; ) {
            vault.setAllocation(strats[i], ideal[i]);
            unchecked { ++i; }
        }

        // Trigger the vault to re-deploy according to new weights
        vault.rebalance();

        emit Rebalanced(block.timestamp, strats, ideal);
    }
}
