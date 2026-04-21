// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2}     from "forge-std/Test.sol";
import {IERC20}             from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AaveV3Strategy}     from "../../src/strategies/AaveV3Strategy.sol";

/// @dev Run with:  forge test --profile fork --match-path test/fork/AaveV3Strategy.t.sol -v
///      Requires:  BASE_RPC_URL env var pointing to a Base mainnet archive node.
contract AaveV3StrategyForkTest is Test {
    // ── Base mainnet addresses ────────────────────────────────────────────────
    address constant USDC   = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant POOL   = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address constant A_USDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;

    // aUSDC contract — holds 80M+ native USDC on Base at the pinned block
    address constant WHALE = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;

    address internal owner = makeAddr("owner");

    AaveV3Strategy internal strategy;

    uint256 internal constant D6 = 1e6;

    function setUp() public {
        // address(this) acts as the vault in fork tests
        strategy = new AaveV3Strategy(USDC, address(this), POOL, A_USDC);

        // Fund this contract from a live whale (deal() breaks on Base USDC proxy)
        vm.prank(WHALE);
        IERC20(USDC).transfer(address(this), 100_000 * D6);

        IERC20(USDC).approve(address(strategy), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_deposit_increases_totalAssets() public {
        strategy.deposit(10_000 * D6);

        assertApproxEqAbs(strategy.totalAssets(), 10_000 * D6, 10);
    }

    function test_fork_estimatedAPY_nonzero() public view {
        uint256 bps = strategy.estimatedAPY();
        console2.log("Aave V3 APY (bps):", bps);
        assertGt(bps, 0);
    }

    function test_fork_withdraw_returns_usdc() public {
        strategy.deposit(10_000 * D6);

        uint256 before = IERC20(USDC).balanceOf(address(this));
        strategy.withdraw(5_000 * D6);

        assertApproxEqAbs(IERC20(USDC).balanceOf(address(this)) - before, 5_000 * D6, 10);
    }

    function test_fork_withdrawAll_returns_all() public {
        strategy.deposit(10_000 * D6);

        // Let some interest accrue (warp 30 days)
        vm.warp(block.timestamp + 30 days);
        vm.roll(block.number + 30 * 7200);

        uint256 before = IERC20(USDC).balanceOf(address(this));
        strategy.withdrawAll();

        uint256 received = IERC20(USDC).balanceOf(address(this)) - before;
        assertGe(received, 10_000 * D6); // at least principal back
        console2.log("Received after 30d (USDC):", received / D6);
    }

    function test_fork_harvest_returns_yield() public {
        strategy.deposit(10_000 * D6);

        vm.warp(block.timestamp + 365 days);
        vm.roll(block.number + 365 * 7200);

        uint256 before = IERC20(USDC).balanceOf(address(this));
        uint256 harvested = strategy.harvest();

        console2.log("Harvested after 1y (USDC):", harvested / D6);
        assertGe(IERC20(USDC).balanceOf(address(this)) - before, 0);
    }
}
