// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal MetaMorpho (ERC-4626 vault on top of Morpho Blue) interface.
interface IMetaMorpho {
    // ERC-4626
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

    function balanceOf(address account) external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
    function asset() external view returns (address);

    /// @notice Current 7-day average APY in ray (1e27).
    function avgApy() external view returns (uint256);
}
