// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {RWAVault}       from "../src/RWAVault.sol";
import {MockERC20}      from "./mocks/MockERC20.sol";
import {MockStrategy}   from "./mocks/MockStrategy.sol";
import {IStrategy}      from "../src/interfaces/IStrategy.sol";

contract RWAVaultTest is Test {
    // ── Actors ────────────────────────────────────────────────────────────────
    address internal owner    = makeAddr("owner");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal feeRecip = makeAddr("feeRecipient");

    // ── Core contracts ────────────────────────────────────────────────────────
    MockERC20    internal usdc;
    RWAVault     internal vault;
    MockStrategy internal stratA;
    MockStrategy internal stratB;

    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 internal constant D6 = 1e6; // USDC 6 decimals

    // ── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        vm.startPrank(owner);

        usdc  = new MockERC20("USD Coin", "USDC", 6);
        vault = new RWAVault(address(usdc), feeRecip, 0 /* no cap */);

        stratA = new MockStrategy(address(usdc), address(vault), "Strategy A");
        stratB = new MockStrategy(address(usdc), address(vault), "Strategy B");

        vm.stopPrank();

        // Fund Alice and Bob
        usdc.mint(alice, 100_000 * D6);
        usdc.mint(bob,   100_000 * D6);

        vm.prank(alice); usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(vault), type(uint256).max);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// @dev Propose, warp past timelock, execute — convenience for existing tests.
    function _addStrategy(address strategy, uint256 allocationBps) internal {
        vault.proposeStrategy(strategy, allocationBps);
        vm.warp(block.timestamp + vault.STRATEGY_TIMELOCK());
        vault.executeAddStrategy(strategy, allocationBps);
    }

    function _addStratAB() internal {
        vm.startPrank(owner);
        _addStrategy(address(stratA), 6_000); // 60 %
        _addStrategy(address(stratB), 4_000); // 40 %
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Deployment & initial state
    // ─────────────────────────────────────────────────────────────────────────

    function test_initialState() public view {
        assertEq(vault.asset(), address(usdc));
        assertEq(vault.feeRecipient(), feeRecip);
        assertEq(vault.depositCap(), 0);
        assertEq(vault.highWaterMark(), 0);
        assertEq(vault.totalAssets(), 0);
        assertEq(vault.totalSupply(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Strategy management
    // ─────────────────────────────────────────────────────────────────────────

    function test_addStrategy() public {
        vm.startPrank(owner);
        _addStrategy(address(stratA), 5_000);
        vm.stopPrank();

        (address[] memory addrs, uint256[] memory allocs, ) = vault.strategyDetails();
        assertEq(addrs.length, 1);
        assertEq(addrs[0], address(stratA));
        assertEq(allocs[0], 5_000);
    }

    function test_addStrategy_reverts_duplicate() public {
        vm.startPrank(owner);
        _addStrategy(address(stratA), 5_000);
        vm.expectRevert(RWAVault.StrategyAlreadyAdded.selector);
        vault.proposeStrategy(address(stratA), 1_000);
        vm.stopPrank();
    }

    function test_addStrategy_reverts_allocation_exceeds_cap() public {
        vm.startPrank(owner);
        _addStrategy(address(stratA), 6_000);
        vm.expectRevert(RWAVault.AllocationExceedsCap.selector);
        vault.proposeStrategy(address(stratB), 5_000); // 6000+5000 > 10000
        vm.stopPrank();
    }

    /// @dev Regression: strategy pointing at a different vault must be rejected.
    function test_addStrategy_reverts_wrong_vault() public {
        // Strategy whose vault address is NOT this vault
        MockStrategy wrongVault = new MockStrategy(
            address(usdc),
            makeAddr("other_vault"),
            "Misconfigured"
        );
        vm.prank(owner);
        vm.expectRevert(RWAVault.StrategyVaultMismatch.selector);
        vault.proposeStrategy(address(wrongVault), 5_000);
    }

    function test_removeStrategy_withdrawsFunds() public {
        _addStratAB();

        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        uint256 vaultBalBefore = usdc.balanceOf(address(vault));

        vm.prank(owner);
        vault.removeStrategy(address(stratA));

        assertGt(usdc.balanceOf(address(vault)), vaultBalBefore);
        assertEq(stratA.totalAssets(), 0);
    }

    function test_setAllocation_reverts_overflow() public {
        vm.startPrank(owner);
        _addStrategy(address(stratA), 8_000);
        _addStrategy(address(stratB), 2_000);
        vm.expectRevert(RWAVault.AllocationExceedsCap.selector);
        vault.setAllocation(address(stratA), 9_000); // 9000+2000 > 10000
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Strategy timelock (Finding 10A)
    // ─────────────────────────────────────────────────────────────────────────

    function test_proposeStrategy_then_execute_after_timelock() public {
        vm.startPrank(owner);
        vault.proposeStrategy(address(stratA), 5_000);

        // Cannot execute before timelock
        vm.expectRevert(RWAVault.StrategyNotReady.selector);
        vault.executeAddStrategy(address(stratA), 5_000);

        // Warp past timelock
        vm.warp(block.timestamp + vault.STRATEGY_TIMELOCK());
        vault.executeAddStrategy(address(stratA), 5_000);
        vm.stopPrank();

        (address[] memory addrs, , ) = vault.strategyDetails();
        assertEq(addrs.length, 1);
        assertEq(addrs[0], address(stratA));
    }

    function test_executeAddStrategy_reverts_not_pending() public {
        vm.prank(owner);
        vm.expectRevert(RWAVault.StrategyNotPending.selector);
        vault.executeAddStrategy(address(stratA), 5_000);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Deposit
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev With _decimalsOffset = 3, shares ≠ assets on first deposit.
    ///      Verify shares match previewDeposit and the NAV is correct.
    function test_deposit_mints_shares() public {
        _addStratAB();

        uint256 depositAmount  = 10_000 * D6;
        uint256 expectedShares = vault.previewDeposit(depositAmount);

        vm.prank(alice);
        uint256 shares = vault.deposit(depositAmount, alice);

        assertEq(shares, expectedShares);
        assertEq(vault.balanceOf(alice), expectedShares);
        // Full NAV reflected
        assertEq(vault.totalAssets(), depositAmount);
    }

    function test_deposit_distributes_to_strategies() public {
        _addStratAB();

        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        // 60 % to A, 40 % to B — USDC flows are unaffected by share offset
        assertEq(stratA.totalAssets(), 6_000 * D6);
        assertEq(stratB.totalAssets(), 4_000 * D6);
    }

    function test_deposit_cap_enforced() public {
        vm.prank(owner);
        vault.setDepositCap(5_000 * D6);

        vm.prank(alice);
        vm.expectRevert(RWAVault.DepositCapExceeded.selector);
        vault.deposit(6_000 * D6, alice);
    }

    function test_deposit_cap_zero_means_unlimited() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(99_000 * D6, alice);
        assertEq(vault.totalAssets(), 99_000 * D6);
    }

    /// @dev Second depositor must receive shares proportional to their assets
    ///      relative to the current NAV, regardless of the decimals offset.
    function test_second_deposit_correct_share_price() public {
        _addStratAB();

        // Alice deposits first
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);
        uint256 aliceShares = vault.balanceOf(alice);

        // Simulate 1000 USDC of yield — total NAV = 11 000
        usdc.mint(address(stratA), 1_000 * D6);

        // Bob deposits 5 500 into a 11 000 NAV vault
        // He should receive aliceShares * 5_500/11_000 = aliceShares / 2
        uint256 expectedBobShares = aliceShares * 5_500 / 11_000;

        vm.prank(bob);
        uint256 bobShares = vault.deposit(5_500 * D6, bob);

        // Within 0.1 % — rounding from integer division is fine
        assertApproxEqRel(bobShares, expectedBobShares, 1e15);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Withdrawal
    // ─────────────────────────────────────────────────────────────────────────

    function test_withdraw_returns_usdc() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw(5_000 * D6, alice, alice);

        assertEq(usdc.balanceOf(alice) - aliceBefore, 5_000 * D6);
    }

    function test_withdraw_burns_shares() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);
        uint256 initialShares = vault.balanceOf(alice);

        vm.prank(alice);
        vault.withdraw(5_000 * D6, alice, alice);

        // Half the USDC withdrawn → approximately half the shares remain
        assertApproxEqRel(vault.balanceOf(alice), initialShares / 2, 1e15);
    }

    function test_redeem_all_shares() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        uint256 aliceShares = vault.balanceOf(alice); // read before prank
        vm.prank(alice);
        uint256 assets = vault.redeem(aliceShares, alice, alice);

        // Full principal returned within 2 wei (rounding from virtual offset)
        assertApproxEqAbs(assets, 10_000 * D6, 2);
        assertEq(vault.balanceOf(alice), 0);
        assertEq(vault.totalSupply(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Performance fee & HWM
    // ─────────────────────────────────────────────────────────────────────────

    function test_harvest_charges_performance_fee() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        stratA.addYield(1_000 * D6);
        usdc.mint(address(stratA), 1_000 * D6);

        vm.prank(owner);
        vault.harvest();

        // 10 % of 1000 yield → feeRecipient gets shares
        assertGt(vault.balanceOf(feeRecip), 0);
    }

    function test_no_fee_below_high_water_mark() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        vm.prank(owner);
        vault.harvest();  // no yield accumulated
        assertEq(vault.balanceOf(feeRecip), 0);
    }

    function test_high_water_mark_advances_after_harvest() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        stratA.addYield(500 * D6);
        usdc.mint(address(stratA), 500 * D6);

        vm.prank(owner);
        vault.harvest();

        assertGt(vault.highWaterMark(), 10_000 * D6);
    }

    /// @dev HWM must never decrease — fee should only be charged on new all-time-high NAV.
    function test_hwm_never_decreases_on_loss() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        // Advance HWM by injecting real yield and harvesting
        stratA.addYield(1_000 * D6);
        usdc.mint(address(stratA), 1_000 * D6);
        vm.prank(owner);
        vault.harvest();

        uint256 hwmAfterYield    = vault.highWaterMark();
        uint256 feeSharesAfterFirst = vault.balanceOf(feeRecip);
        assertGt(hwmAfterYield, 10_000 * D6); // HWM advanced past deposit NAV

        // Second harvest with no new yield: NAV == HWM, so no additional fee
        vm.prank(owner);
        vault.harvest();

        // HWM must not have changed
        assertEq(vault.highWaterMark(), hwmAfterYield);
        // No new shares minted — feeRecip balance unchanged since first harvest
        assertEq(vault.balanceOf(feeRecip), feeSharesAfterFirst);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rebalance
    // ─────────────────────────────────────────────────────────────────────────

    function test_rebalance_redistributes_funds() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        // Change 60/40 → 80/20 (set B lower first to avoid interim cap breach)
        vm.startPrank(owner);
        vault.setAllocation(address(stratB), 2_000);
        vault.setAllocation(address(stratA), 8_000);
        vault.rebalance();
        vm.stopPrank();

        assertApproxEqAbs(stratA.totalAssets(), 8_000 * D6, 1);
        assertApproxEqAbs(stratB.totalAssets(), 2_000 * D6, 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Emergency withdrawal
    // ─────────────────────────────────────────────────────────────────────────

    function test_emergencyWithdrawAll_pulls_all_funds() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        vm.prank(owner);
        vault.emergencyWithdrawAll();

        assertEq(stratA.totalAssets(), 0);
        assertEq(stratB.totalAssets(), 0);
        assertEq(usdc.balanceOf(address(vault)), 10_000 * D6);
    }

    function test_emergencyWithdrawAll_pauses_allocations() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        vm.prank(owner);
        vault.emergencyWithdrawAll();

        (, uint256[] memory allocs, ) = vault.strategyDetails();
        assertEq(allocs[0], 0);
        assertEq(allocs[1], 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Access control
    // ─────────────────────────────────────────────────────────────────────────

    function test_only_owner_can_propose_strategy() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.proposeStrategy(address(stratA), 5_000);
    }

    function test_only_owner_can_harvest() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.harvest();
    }

    function test_only_owner_can_emergency_withdraw() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.emergencyWithdrawAll();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // totalAssets try/catch DoS protection (Finding 11A)
    // ─────────────────────────────────────────────────────────────────────────

    function test_totalAssets_survives_reverting_strategy() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        // Make stratA revert on totalAssets()
        stratA.setShouldRevert(true);

        // totalAssets should still work — stratA treated as 0
        uint256 total = vault.totalAssets();
        // Only stratB's 4000 USDC counted (stratA's 6000 invisible)
        assertEq(total, 4_000 * D6);

        // Deposits still work
        vm.prank(bob);
        vault.deposit(1_000 * D6, bob);
        // 60% of 1000 goes to stratA (which still accepts deposits), 40% to stratB
        // totalAssets only sees stratB: 4000 + 400 = 4400 (stratA's portion invisible)
        assertEq(vault.totalAssets(), 4_400 * D6);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // InsufficientLiquidity revert (Finding 8A)
    // ─────────────────────────────────────────────────────────────────────────

    function test_withdraw_reverts_insufficient_liquidity() public {
        _addStratAB();
        vm.prank(alice);
        vault.deposit(10_000 * D6, alice);

        // Make strategies return less than requested
        stratA.setPartialWithdraw(true);
        stratB.setPartialWithdraw(true);

        // Try to withdraw more than strategies can provide
        vm.prank(alice);
        vm.expectRevert(RWAVault.InsufficientLiquidity.selector);
        vault.withdraw(10_000 * D6, alice, alice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_deposit_withdraw_roundtrip(uint256 amount) public {
        amount = bound(amount, D6, 50_000 * D6); // min 1 USDC to avoid dust rounding

        _addStratAB();

        usdc.mint(alice, amount);
        vm.prank(alice); usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice); vault.deposit(amount, alice);

        uint256 aliceShares = vault.balanceOf(alice); // read before prank
        vm.prank(alice);
        uint256 received = vault.redeem(aliceShares, alice, alice);

        // The virtual offset introduces at most 1 wei of rounding per operation
        assertApproxEqAbs(received, amount, 2);
    }
}
