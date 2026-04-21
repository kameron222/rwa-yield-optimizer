// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IStrategy} from "../interfaces/IStrategy.sol";

/// @title BaseStrategy
/// @notice Abstract base for all RWAVault strategies. Handles vault-only access
///         control and common storage; subclasses implement protocol-specific logic.
abstract contract BaseStrategy is IStrategy, Ownable2Step {
    using SafeERC20 for IERC20;

    address public immutable override asset;
    address public immutable override vault;
    string  public override name;

    uint256 public totalDeposited; // principal deposited into external protocol

    // ── Errors ─────────────────────────────────────────────────────────────
    error OnlyVault();
    error ZeroAmount();
    error InsufficientBalance();

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address _asset, address _vault, string memory _name) Ownable(msg.sender) {
        asset  = _asset;
        vault  = _vault;
        name   = _name;
    }

    // ── Vault-callable functions ────────────────────────────────────────────

    function deposit(uint256 amount) external override onlyVault {
        if (amount == 0) revert ZeroAmount();
        // Use msg.sender (guaranteed == vault by onlyVault) to avoid arbitrary-send-erc20
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
        _deposit(amount);
    }

    function withdraw(uint256 amount) external override onlyVault returns (uint256 withdrawn) {
        if (amount == 0) revert ZeroAmount();
        withdrawn = _withdraw(amount);
        if (withdrawn < 1) revert InsufficientBalance();
        totalDeposited = totalDeposited > withdrawn ? totalDeposited - withdrawn : 0;
        IERC20(asset).safeTransfer(vault, withdrawn);
    }

    function withdrawAll() external override onlyVault returns (uint256 withdrawn) {
        uint256 bal = totalAssets();
        if (bal < 1) return 0;
        withdrawn = _withdrawAll();
        totalDeposited = 0;
        if (withdrawn > 0) IERC20(asset).safeTransfer(vault, withdrawn);
    }

    function harvest() external override onlyVault returns (uint256 harvested) {
        harvested = _harvest();
        if (harvested > 0) IERC20(asset).safeTransfer(vault, harvested);
    }

    // ── Abstract — must be implemented by each strategy ────────────────────

    function totalAssets() public view virtual returns (uint256);

    // ── Internal hooks — must be implemented by each strategy ──────────────

    function _deposit(uint256 amount) internal virtual;
    function _withdraw(uint256 amount) internal virtual returns (uint256);
    function _withdrawAll() internal virtual returns (uint256);
    function _harvest() internal virtual returns (uint256);

    // ── Emergency ───────────────────────────────────────────────────────────

    error CannotSweepAsset();

    /// @notice Sweep any ERC-20 token to owner (recovery safety valve).
    ///         The strategy's underlying asset is explicitly blocked to prevent
    ///         the owner from draining depositor funds.
    function sweep(address token, uint256 amount) external onlyOwner {
        if (token == asset) revert CannotSweepAsset();
        IERC20(token).safeTransfer(owner(), amount);
    }
}
