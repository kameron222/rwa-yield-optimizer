// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20}    from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStrategy} from "../../src/interfaces/IStrategy.sol";

/// @notice Simple mock strategy for unit testing RWAVault.
///         Funds sit in this contract. Owner can inject simulated yield.
contract MockStrategy is IStrategy {
    using SafeERC20 for IERC20;

    address public override asset;
    address public override vault;
    string  public override name;

    uint256 public totalDeposited;
    uint256 public simulatedYield; // extra yield credited without actual transfer
    uint256 public apyBps = 500;   // 5 %
    bool    public shouldRevert;   // for DoS testing
    bool    public partialWithdraw; // for partial-fill testing

    constructor(address _asset, address _vault, string memory _name) {
        asset = _asset;
        vault = _vault;
        name  = _name;
    }

    // ── IStrategy ────────────────────────────────────────────────────────────

    function deposit(uint256 amount) external override {
        // Use msg.sender (== vault in practice) to mirror BaseStrategy fix
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
    }

    function withdraw(uint256 amount) external override returns (uint256 withdrawn) {
        uint256 bal = IERC20(asset).balanceOf(address(this));
        withdrawn   = amount > bal ? bal : amount;
        // For partial-fill testing: only return half
        if (partialWithdraw && withdrawn > 1) withdrawn = withdrawn / 2;
        if (withdrawn > 0) {
            totalDeposited = totalDeposited > withdrawn ? totalDeposited - withdrawn : 0;
            IERC20(asset).safeTransfer(vault, withdrawn);
        }
    }

    function withdrawAll() external override returns (uint256 withdrawn) {
        withdrawn = IERC20(asset).balanceOf(address(this));
        totalDeposited  = 0;
        simulatedYield  = 0;
        if (withdrawn > 0) IERC20(asset).safeTransfer(vault, withdrawn);
    }

    function harvest() external override returns (uint256 harvested) {
        harvested = simulatedYield;
        simulatedYield = 0;
        if (harvested > 0) IERC20(asset).safeTransfer(vault, harvested);
    }

    function totalAssets() external view override returns (uint256) {
        require(!shouldRevert, "MockStrategy: forced revert");
        return IERC20(asset).balanceOf(address(this)) + simulatedYield;
    }

    function estimatedAPY() external view override returns (uint256) {
        return apyBps;
    }

    // ── Test helpers ─────────────────────────────────────────────────────────

    /// @dev Simulate yield: mint tokens directly into strategy to represent earnings.
    function addYield(uint256 amount) external {
        simulatedYield += amount;
    }

    function setApyBps(uint256 bps) external { apyBps = bps; }
    function setShouldRevert(bool v) external { shouldRevert = v; }
    function setPartialWithdraw(bool v) external { partialWithdraw = v; }
}
