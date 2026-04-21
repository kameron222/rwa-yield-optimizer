// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {RWAVault}       from "../src/RWAVault.sol";
import {Rebalancer}     from "../src/Rebalancer.sol";
import {MockERC20}      from "./mocks/MockERC20.sol";
import {MockStrategy}   from "./mocks/MockStrategy.sol";

contract RebalancerTest is Test {
    address internal owner    = makeAddr("owner");
    address internal keeper   = makeAddr("keeper");
    address internal feeRecip = makeAddr("feeRecipient");
    address internal alice    = makeAddr("alice");

    MockERC20    internal usdc;
    RWAVault     internal vault;
    Rebalancer   internal rebalancer;
    MockStrategy internal stratA;
    MockStrategy internal stratB;

    uint256 internal constant D6 = 1e6;

    function setUp() public {
        vm.startPrank(owner);

        usdc       = new MockERC20("USD Coin", "USDC", 6);
        vault      = new RWAVault(address(usdc), feeRecip, 0);
        rebalancer = new Rebalancer(address(vault));

        stratA = new MockStrategy(address(usdc), address(vault), "Strategy A");
        stratB = new MockStrategy(address(usdc), address(vault), "Strategy B");

        // Add strategies with equal allocation (propose → warp → execute)
        vault.proposeStrategy(address(stratA), 5_000);
        vm.warp(block.timestamp + vault.STRATEGY_TIMELOCK());
        vault.executeAddStrategy(address(stratA), 5_000);
        vault.proposeStrategy(address(stratB), 5_000);
        vm.warp(block.timestamp + vault.STRATEGY_TIMELOCK());
        vault.executeAddStrategy(address(stratB), 5_000);

        // Set scores
        rebalancer.setStrategyScores(address(stratA), 80, 90); // low risk, high liquidity
        rebalancer.setStrategyScores(address(stratB), 50, 60);

        // Snapshot time after strategy setup warps, so cooldown tests work correctly
        // Transfer vault ownership to rebalancer so it can call setAllocation / rebalance
        vault.transferOwnership(address(rebalancer));
        rebalancer.acceptVaultOwnership();

        vm.stopPrank();

        // Fund alice
        usdc.mint(alice, 100_000 * D6);
        vm.prank(alice); usdc.approve(address(vault), type(uint256).max);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _deposit(uint256 amount) internal {
        vm.prank(alice);
        vault.deposit(amount, alice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // shouldRebalance
    // ─────────────────────────────────────────────────────────────────────────

    function test_shouldRebalance_false_within_cooldown() public {
        // Deposit and do an initial rebalance to set lastRebalanceTime
        _deposit(10_000 * D6);
        stratA.setApyBps(2_000);
        stratB.setApyBps(50);
        vm.warp(block.timestamp + 25 hours);
        vm.prank(owner);
        rebalancer.rebalance();

        // Immediately after rebalance → cooldown not met
        assertFalse(rebalancer.shouldRebalance());
    }

    function test_shouldRebalance_true_after_cooldown_with_delta() public {
        _deposit(10_000 * D6);

        // Give strategy A a much higher APY to skew ideal allocations
        stratA.setApyBps(2_000); // 20 % — max
        stratB.setApyBps(100);   // 1 %

        // Advance time past cooldown
        vm.warp(block.timestamp + 25 hours);

        assertTrue(rebalancer.shouldRebalance());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // computeIdealAllocations
    // ─────────────────────────────────────────────────────────────────────────

    function test_computeIdeal_sums_to_10000() public view {
        (, uint256[] memory ideal, , ) = rebalancer.computeIdealAllocations();
        uint256 total;
        for (uint256 i; i < ideal.length; i++) total += ideal[i];
        assertEq(total, 10_000);
    }

    function test_computeIdeal_higher_apy_gets_more() public {
        stratA.setApyBps(1_000); // 10 %
        stratB.setApyBps(200);   // 2 %

        (, uint256[] memory ideal, , ) = rebalancer.computeIdealAllocations();
        // Strategy A should have higher allocation
        assertGt(ideal[0], ideal[1]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // rebalance()
    // ─────────────────────────────────────────────────────────────────────────

    function test_rebalance_reverts_too_soon() public {
        // Do an initial rebalance to set lastRebalanceTime
        _deposit(10_000 * D6);
        stratA.setApyBps(2_000);
        stratB.setApyBps(50);
        vm.warp(block.timestamp + 25 hours);
        vm.prank(owner);
        rebalancer.rebalance();

        // Immediately try again → should revert TooSoon
        vm.prank(owner);
        vm.expectRevert(Rebalancer.TooSoon.selector);
        rebalancer.rebalance();
    }

    function test_rebalance_reverts_below_delta_threshold() public {
        // Force ideal to match current by setting deltaThreshold very high
        vm.prank(owner);
        rebalancer.setDeltaThreshold(10_000); // unreachable threshold

        vm.warp(block.timestamp + 25 hours);
        vm.prank(owner);
        vm.expectRevert(Rebalancer.NoBelowThreshold.selector);
        rebalancer.rebalance();
    }

    function test_rebalance_redistributes_capital() public {
        _deposit(10_000 * D6);

        stratA.setApyBps(2_000); // high → should get more
        stratB.setApyBps(50);

        vm.warp(block.timestamp + 25 hours);
        vm.prank(owner);
        rebalancer.rebalance();

        // Strategy A should hold more than the original 5000
        assertGt(stratA.totalAssets(), 5_000 * D6);
        assertLt(stratB.totalAssets(), 5_000 * D6);
    }

    function test_rebalance_updates_lastRebalanceTime() public {
        _deposit(10_000 * D6);
        stratA.setApyBps(2_000);
        stratB.setApyBps(50);

        uint256 ts = block.timestamp + 25 hours;
        vm.warp(ts);
        vm.prank(owner);
        rebalancer.rebalance();

        assertEq(rebalancer.lastRebalanceTime(), ts);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function test_setWeights_must_sum_100() public {
        vm.prank(owner);
        vm.expectRevert(Rebalancer.InvalidWeights.selector);
        rebalancer.setWeights(70, 20, 5); // sum = 95
    }

    function test_setWeights_valid() public {
        vm.prank(owner);
        rebalancer.setWeights(60, 30, 10);
        assertEq(rebalancer.weightApy(), 60);
        assertEq(rebalancer.weightRisk(), 30);
    }

    function test_setCooldown() public {
        vm.prank(owner);
        rebalancer.setCooldown(12 hours);
        assertEq(rebalancer.rebalanceCooldown(), 12 hours);
    }

    function test_only_owner_can_rebalance() public {
        vm.warp(block.timestamp + 25 hours);
        vm.prank(keeper);
        vm.expectRevert();
        rebalancer.rebalance();
    }

    function test_setStrategyScores_reverts_risk_out_of_range() public {
        vm.prank(owner);
        vm.expectRevert(Rebalancer.ScoreOutOfRange.selector);
        rebalancer.setStrategyScores(address(stratA), 101, 50);
    }

    function test_setStrategyScores_reverts_liquidity_out_of_range() public {
        vm.prank(owner);
        vm.expectRevert(Rebalancer.ScoreOutOfRange.selector);
        rebalancer.setStrategyScores(address(stratA), 80, 101);
    }

    function test_setStrategyScores_valid() public {
        vm.prank(owner);
        rebalancer.setStrategyScores(address(stratA), 100, 100);
        assertEq(rebalancer.riskScore(address(stratA)), 100);
        assertEq(rebalancer.liquidityScore(address(stratA)), 100);
    }
}
