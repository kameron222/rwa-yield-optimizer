// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStrategy
/// @notice Interface every RWAVault strategy must implement.
///         All amounts are in the underlying asset's native decimals (USDC = 6).
interface IStrategy {
    // ── Core ─────────────────────────────────────────────────────────────────

    /// @notice Deposit `amount` of the underlying asset into the external protocol.
    ///         Caller must have approved this contract to spend `amount`.
    function deposit(uint256 amount) external;

    /// @notice Withdraw up to `amount` from the external protocol back to the vault.
    /// @return withdrawn Actual amount returned (may be less than requested).
    function withdraw(uint256 amount) external returns (uint256 withdrawn);

    /// @notice Withdraw all funds from the external protocol back to the vault.
    /// @return withdrawn Total amount returned.
    function withdrawAll() external returns (uint256 withdrawn);

    /// @notice Claim any accrued yield, swap to underlying if necessary, and
    ///         return the harvested amount (net of swap costs) to the vault.
    /// @return harvested Net yield claimed in underlying asset units.
    function harvest() external returns (uint256 harvested);

    // ── View ─────────────────────────────────────────────────────────────────

    /// @notice Current fair value of all assets this strategy controls,
    ///         denominated in the underlying asset (including accrued interest).
    function totalAssets() external view returns (uint256);

    /// @notice Current estimated annualised yield in basis points (1% = 100 bps).
    ///         Returns 0 when the rate cannot be determined.
    function estimatedAPY() external view returns (uint256 bps);

    /// @notice Address of the ERC-20 underlying asset (USDC on Base).
    function asset() external view returns (address);

    /// @notice Address of the vault that owns this strategy.
    function vault() external view returns (address);

    /// @notice Human-readable name, e.g. "Aave V3 USDC Strategy".
    function name() external view returns (string memory);
}
