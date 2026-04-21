// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2}       from "forge-std/Test.sol";
import {IERC20}               from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CompoundV3Strategy}   from "../../src/strategies/CompoundV3Strategy.sol";

/// @dev Run with:  forge test --profile fork --match-path test/fork/CompoundV3Strategy.t.sol -v
contract CompoundV3StrategyForkTest is Test {
    // ── Base mainnet addresses ────────────────────────────────────────────────
    address constant USDC  = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant COMET = 0xb125E6687d4313864e53df431d5425969c15Eb2F; // Base native USDC market

    // aUSDC contract — holds 80M+ native USDC on Base at the pinned block
    address constant WHALE = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;

    CompoundV3Strategy internal strategy;

    uint256 internal constant D6 = 1e6;

    function setUp() public {
        // address(this) acts as the vault in fork tests
        strategy = new CompoundV3Strategy(USDC, address(this), COMET);

        // Fund this contract from a live whale (deal() breaks on Base USDC proxy)
        vm.prank(WHALE);
        IERC20(USDC).transfer(address(this), 100_000 * D6);

        IERC20(USDC).approve(address(strategy), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_deposit() public {
        strategy.deposit(10_000 * D6);

        assertApproxEqAbs(strategy.totalAssets(), 10_000 * D6, 10);
    }

    function test_fork_estimatedAPY_nonzero() public view {
        uint256 bps = strategy.estimatedAPY();
        console2.log("Compound V3 APY (bps):", bps);
        assertGt(bps, 0);
    }

    function test_fork_withdraw() public {
        strategy.deposit(10_000 * D6);

        uint256 before = IERC20(USDC).balanceOf(address(this));
        strategy.withdraw(4_000 * D6);

        assertApproxEqAbs(IERC20(USDC).balanceOf(address(this)) - before, 4_000 * D6, 10);
    }

    function test_fork_withdrawAll_after_interest() public {
        strategy.deposit(10_000 * D6);

        vm.warp(block.timestamp + 30 days);
        vm.roll(block.number + 30 * 7200);

        uint256 before = IERC20(USDC).balanceOf(address(this));
        strategy.withdrawAll();

        uint256 received = IERC20(USDC).balanceOf(address(this)) - before;
        assertGe(received, 10_000 * D6);
        console2.log("Compound received after 30d:", received / D6);
    }

    function test_fork_harvest_extracts_yield() public {
        strategy.deposit(10_000 * D6);

        vm.warp(block.timestamp + 180 days);
        vm.roll(block.number + 180 * 7200);

        uint256 before = IERC20(USDC).balanceOf(address(this));
        uint256 harvested = strategy.harvest();

        console2.log("Compound harvested 180d:", harvested / D6);
        assertGe(IERC20(USDC).balanceOf(address(this)), before);
    }
}
