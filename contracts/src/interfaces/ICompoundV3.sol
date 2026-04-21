// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Compound V3 (Comet) interface used by CompoundV3Strategy.
interface IComet {
    function supply(address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external;

    /// @notice Base token balance including interest (in base token decimals).
    function balanceOf(address account) external view returns (uint256);

    /// @notice Current supply rate per second, scaled by 1e18.
    function getSupplyRate(uint256 utilization) external view returns (uint64);

    /// @notice Current utilization ratio, scaled by 1e18.
    function getUtilization() external view returns (uint256);

    /// @notice Base token address (USDC on Base).
    function baseToken() external view returns (address);

    function totalSupply() external view returns (uint256);
    function totalBorrow() external view returns (uint256);
}
