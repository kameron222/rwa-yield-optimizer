// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BaseStrategy} from "./BaseStrategy.sol";
import {IMetaMorpho} from "../interfaces/IMorpho.sol";

/// @title MorphoStrategy
/// @notice Deposits USDC into a MetaMorpho ERC-4626 vault on Base.
///         MetaMorpho vaults auto-allocate across Morpho Blue markets and
///         auto-compound yield — this strategy wraps that interface cleanly.
///
/// The vault address is configurable so the owner can point at the highest-APY
/// MetaMorpho USDC vault deployed on Base (e.g. Steakhouse USDC).
///
/// Base mainnet Morpho address: 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
contract MorphoStrategy is BaseStrategy {
    using SafeERC20 for IERC20;

    uint256 private constant RAY      = 1e27;
    uint256 private constant BPS_SCALE = 10_000;

    IMetaMorpho public morphoVault;

    event MorphoVaultUpdated(address indexed oldVault, address indexed newVault);
    event Deposited(uint256 assets, uint256 shares);
    event Withdrawn(uint256 assets, uint256 shares);
    event Harvested(uint256 yield, uint256 sharesBurned);

    error InvalidVault();

    constructor(
        address _usdc,
        address _stratVault,   // RWAVault (the caller)
        address _morphoVault   // MetaMorpho USDC vault on Base
    ) BaseStrategy(_usdc, _stratVault, "Morpho USDC Strategy") {
        _setMorphoVault(_morphoVault);
    }

    // ── Admin ───────────────────────────────────────────────────────────────

    /// @notice Allows owner to rotate to a better-yielding MetaMorpho vault.
    ///         Withdraws everything, updates pointer, re-approves.
    function setMorphoVault(address newVault) external onlyOwner {
        IMetaMorpho oldVault = morphoVault;
        uint256 bal = oldVault.balanceOf(address(this));

        // CEI: update morphoVault state BEFORE any external calls so a reentrant
        //      call to setMorphoVault would see the new vault address.
        IERC20(asset).forceApprove(address(oldVault), 0);
        _setMorphoVault(newVault); // writes morphoVault = newVault, approves it

        if (bal > 0) {
            // Redeem from OLD vault using cached reference; capture return value (Slither: unused-return)
            uint256 assetsReceived = oldVault.redeem(bal, address(this), address(this));
            _deposit(assetsReceived); // re-deposit actual received into new vault
        }
    }

    function _setMorphoVault(address newVault) internal {
        if (newVault == address(0)) revert InvalidVault();
        address old = address(morphoVault);
        morphoVault = IMetaMorpho(newVault);
        IERC20(asset).forceApprove(newVault, type(uint256).max);
        emit MorphoVaultUpdated(old, newVault);
    }

    // ── IStrategy ───────────────────────────────────────────────────────────

    function totalAssets() public view override returns (uint256) {
        uint256 shares = morphoVault.balanceOf(address(this));
        if (shares < 1) return 0;
        return morphoVault.convertToAssets(shares);
    }

    /// @notice Converts MetaMorpho's avgApy (ray, 1e27) to basis points.
    function estimatedAPY() external view override returns (uint256 bps) {
        try morphoVault.avgApy() returns (uint256 rayApy) {
            bps = rayApy * BPS_SCALE / RAY;
        } catch {
            bps = 0;
        }
    }

    // ── Internal ────────────────────────────────────────────────────────────

    function _deposit(uint256 amount) internal override {
        uint256 shares = morphoVault.deposit(amount, address(this));
        emit Deposited(amount, shares);
    }

    function _withdraw(uint256 amount) internal override returns (uint256 received) {
        uint256 before = IERC20(asset).balanceOf(address(this));
        uint256 available = totalAssets();
        uint256 toWithdraw = amount > available ? available : amount;
        // Capture shares burned (Slither: unused-return); use in emit for traceability
        uint256 sharesBurned = morphoVault.withdraw(toWithdraw, address(this), address(this));
        received = IERC20(asset).balanceOf(address(this)) - before;
        emit Withdrawn(toWithdraw, sharesBurned);
    }

    function _withdrawAll() internal override returns (uint256 received) {
        uint256 shares = morphoVault.balanceOf(address(this));
        if (shares < 1) return 0;
        // Use redeem() return value directly instead of balance delta (Slither: unused-return)
        received = morphoVault.redeem(shares, address(this), address(this));
        emit Withdrawn(received, shares);
    }

    function _harvest() internal override returns (uint256 harvested) {
        uint256 current = totalAssets();
        if (current > totalDeposited) {
            harvested = current - totalDeposited;
            // Capture shares burned (Slither: unused-return); used in emit below
            uint256 sharesBurned = morphoVault.withdraw(harvested, address(this), address(this));
            emit Harvested(harvested, sharesBurned);
        } else {
            emit Harvested(0, 0);
        }
    }
}
