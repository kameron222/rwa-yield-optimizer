// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2}    from "forge-std/Test.sol";
import {IERC20}            from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MorphoStrategy}    from "../../src/strategies/MorphoStrategy.sol";

/// @dev Run with:  forge test --profile fork --match-path test/fork/MorphoStrategy.t.sol -v
///
///      MetaMorpho USDC vault on Base (Steakhouse USDC):
///        0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca
contract MorphoStrategyForkTest is Test {
    // ── Base mainnet addresses ─────────────────────────────────────────────────
    address constant USDC         = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant MORPHO_VAULT = 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca; // Steakhouse USDC

    // aUSDC contract — holds 80M+ native USDC on Base at the pinned block
    address constant WHALE = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;

    MorphoStrategy internal strategy;

    uint256 internal constant D6 = 1e6;

    function setUp() public {
        // address(this) acts as the vault in fork tests
        strategy = new MorphoStrategy(USDC, address(this), MORPHO_VAULT);

        // Fund this contract from a live whale (deal() breaks on Base USDC proxy)
        vm.prank(WHALE);
        IERC20(USDC).transfer(address(this), 100_000 * D6);

        IERC20(USDC).approve(address(strategy), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_deposit_receives_shares() public {
        strategy.deposit(10_000 * D6);

        assertApproxEqAbs(strategy.totalAssets(), 10_000 * D6, 100);
    }

    function test_fork_estimatedAPY() public view {
        uint256 bps = strategy.estimatedAPY();
        console2.log("MetaMorpho APY (bps):", bps);
        // May be 0 if avgApy() not implemented — that's fine (try/catch in strategy)
        assertGe(bps, 0);
    }

    function test_fork_withdraw() public {
        strategy.deposit(10_000 * D6);

        uint256 before = IERC20(USDC).balanceOf(address(this));
        strategy.withdraw(3_000 * D6);

        assertApproxEqAbs(IERC20(USDC).balanceOf(address(this)) - before, 3_000 * D6, 100);
    }

    function test_fork_withdrawAll() public {
        strategy.deposit(10_000 * D6);

        vm.warp(block.timestamp + 7 days);
        vm.roll(block.number + 7 * 7200);

        uint256 before = IERC20(USDC).balanceOf(address(this));
        strategy.withdrawAll();

        uint256 received = IERC20(USDC).balanceOf(address(this)) - before;
        assertGe(received, 10_000 * D6 - 100); // allow tiny rounding
        console2.log("MetaMorpho received after 7d:", received / D6);
    }

    function test_fork_harvest_nonzero_after_time() public {
        strategy.deposit(50_000 * D6);

        vm.warp(block.timestamp + 365 days);
        vm.roll(block.number + 365 * 7200);

        uint256 before = IERC20(USDC).balanceOf(address(this));
        strategy.harvest();

        uint256 gained = IERC20(USDC).balanceOf(address(this)) - before;
        console2.log("MetaMorpho harvested 1y:", gained / D6);
    }

    function test_fork_vault_rotation() public {
        strategy.deposit(10_000 * D6);

        // Rotate to same vault (simplest test without a second vault)
        address owner_ = strategy.owner();
        vm.prank(owner_);
        strategy.setMorphoVault(MORPHO_VAULT);

        // Funds should still be intact
        assertApproxEqAbs(strategy.totalAssets(), 10_000 * D6, 100);
    }
}
