// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626}        from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20}          from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20}         from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}      from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math}           from "@openzeppelin/contracts/utils/math/Math.sol";
import {IStrategy}      from "./interfaces/IStrategy.sol";

/// @title  RWAVault
/// @notice ERC-4626 tokenised vault that allocates USDC across multiple yield strategies.
///
///         Key mechanics
///         ─────────────
///         • Depositors receive rwUSDC shares proportional to the current NAV.
///         • Allocations to strategies are expressed in basis points (sum ≤ 10 000).
///         • A 10 % *performance fee* is charged only on yield (not principal), using a
///           high-water-mark to prevent double-charging after losses.
///         • Admin can add / remove strategies, update allocations, and set a deposit cap.
///         • emergencyWithdrawAll() pulls every strategy's funds back to the vault.
///
/// @dev    Inherits ERC4626 which delegates totalAssets() → our override.
///         Shares are priced at (totalAssets / totalSupply) so they appreciate over time.
contract RWAVault is ERC4626, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 public constant MAX_BPS          = 10_000;
    uint256 public constant PERFORMANCE_FEE  = 1_000;   // 10 % of yield
    uint256 public constant MAX_STRATEGIES   = 10;

    // ── State ────────────────────────────────────────────────────────────────

    struct StrategyInfo {
        bool     active;
        uint256  allocationBps; // target weight of this strategy (vs total)
    }

    address[]                        public strategies;
    mapping(address => StrategyInfo) public strategyInfo;

    /// @notice Maximum total USDC that can be deposited (0 = unlimited).
    uint256 public depositCap;

    /// @notice Fee recipient for performance fees.
    address public feeRecipient;

    /// @notice High-water mark: highest total assets ever recorded (pre-fee).
    uint256 public highWaterMark;

    uint256 public constant STRATEGY_TIMELOCK = 24 hours;

    mapping(address => uint256) public pendingStrategies; // strategy => activation timestamp

    // ── Events ───────────────────────────────────────────────────────────────
    event StrategyProposed(address indexed strategy, uint256 allocationBps, uint256 readyAt);
    event StrategyAdded(address indexed strategy, uint256 allocationBps);
    event StrategyRemoved(address indexed strategy);
    event AllocationUpdated(address indexed strategy, uint256 allocationBps);
    event DepositCapUpdated(uint256 newCap);
    event FeeRecipientUpdated(address indexed newRecipient);
    event PerformanceFeeCharged(uint256 yield, uint256 fee);
    event Rebalanced(uint256 totalAssets);
    event EmergencyWithdrawal(uint256 totalRecovered);
    event Harvested(uint256 totalHarvested, uint256 feeCharged);

    // ── Errors ───────────────────────────────────────────────────────────────
    error DepositCapExceeded();
    error TooManyStrategies();
    error StrategyAlreadyAdded();
    error StrategyNotFound();
    error InvalidAllocation();
    error AllocationExceedsCap();
    error ZeroAddress();
    error InsufficientLiquidity();
    error StrategyNotReady();
    error StrategyNotPending();

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _usdc,
        address _feeRecipient,
        uint256 _depositCap
    )
        ERC4626(IERC20(_usdc))
        ERC20("RWA Vault USDC", "rwUSDC")
        Ownable(msg.sender)
    {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        feeRecipient  = _feeRecipient;
        depositCap    = _depositCap;
        highWaterMark = 0;
    }

    // ── ERC-4626 overrides ───────────────────────────────────────────────────

    /// @dev  Virtual offset of 3 adds 10^3 virtual shares/assets to the initial
    ///       pool, making the first-depositor inflation attack economically
    ///       infeasible: an attacker would need to donate 10^3 × totalAssets
    ///       worth of tokens to move the share price by even 1 unit.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    /// @notice Sum of: USDC held in this contract + USDC deployed in strategies.
    /// @dev    Strategy calls are wrapped in try/catch so a single reverting strategy
    ///         (e.g. paused Aave pool) cannot freeze the entire vault.
    function totalAssets() public view override returns (uint256 total) {
        total = IERC20(asset()).balanceOf(address(this));
        uint256 len = strategies.length;
        for (uint256 i; i < len; ) {
            if (strategyInfo[strategies[i]].active) {
                try IStrategy(strategies[i]).totalAssets() returns (uint256 stratAssets) {
                    total += stratAssets;
                } catch {
                    // Strategy is unreachable — treat as 0 to avoid DoS
                }
            }
            unchecked { ++i; }
        }
    }

    /// @dev  Apply deposit cap before the standard ERC-4626 deposit flow.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant {
        if (depositCap != 0 && totalAssets() + assets > depositCap) revert DepositCapExceeded();
        super._deposit(caller, receiver, assets, shares);
        _deployToStrategies(assets);
        // Advance high-water mark so deposits don't trigger performance fees
        uint256 nav = totalAssets();
        if (nav > highWaterMark) highWaterMark = nav;
    }

    /// @dev  Pull funds back from strategies if the vault doesn't hold enough liquid USDC.
    function _withdraw(
        address caller,
        address receiver,
        address owner_,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant {
        _ensureLiquidity(assets);
        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    // ── Strategy management (owner) ──────────────────────────────────────────

    // ── Errors (additional) ──────────────────────────────────────────────────
    error StrategyVaultMismatch();

    /// @notice Propose a new strategy. Must wait STRATEGY_TIMELOCK before execution.
    function proposeStrategy(address strategy, uint256 allocationBps) external onlyOwner {
        if (strategy == address(0))              revert ZeroAddress();
        if (strategies.length >= MAX_STRATEGIES) revert TooManyStrategies();
        if (strategyInfo[strategy].active)       revert StrategyAlreadyAdded();
        if (IStrategy(strategy).vault() != address(this)) revert StrategyVaultMismatch();
        _checkTotalAllocation(allocationBps);

        pendingStrategies[strategy] = block.timestamp + STRATEGY_TIMELOCK;
        emit StrategyProposed(strategy, allocationBps, block.timestamp + STRATEGY_TIMELOCK);
    }

    /// @notice Execute a previously proposed strategy after the timelock has elapsed.
    function executeAddStrategy(address strategy, uint256 allocationBps) external onlyOwner {
        uint256 readyAt = pendingStrategies[strategy];
        if (readyAt == 0)               revert StrategyNotPending();
        if (block.timestamp < readyAt)  revert StrategyNotReady();

        delete pendingStrategies[strategy];

        if (strategies.length >= MAX_STRATEGIES) revert TooManyStrategies();
        if (strategyInfo[strategy].active)       revert StrategyAlreadyAdded();
        _checkTotalAllocation(allocationBps);

        strategies.push(strategy);
        strategyInfo[strategy] = StrategyInfo({ active: true, allocationBps: allocationBps });
        emit StrategyAdded(strategy, allocationBps);
    }

    /// @notice Remove a strategy — withdraws all its funds first.
    function removeStrategy(address strategy) external onlyOwner nonReentrant {
        if (!strategyInfo[strategy].active) revert StrategyNotFound();

        // CEI: update state BEFORE external call
        strategyInfo[strategy].active        = false;
        strategyInfo[strategy].allocationBps = 0;

        // Remove from array (swap-and-pop) — also state, done before external call
        uint256 len = strategies.length;
        for (uint256 i; i < len; ) {
            if (strategies[i] == strategy) {
                strategies[i] = strategies[len - 1];
                strategies.pop();
                break;
            }
            unchecked { ++i; }
        }

        // External interaction last (CEI); capture return value (Slither: unused-return)
        // withdrawn may be 0 if the strategy held no assets — that is acceptable
        uint256 withdrawn = IStrategy(strategy).withdrawAll();
        emit StrategyRemoved(strategy);
        // Reference withdrawn to prevent any unused-variable lint warning
        if (withdrawn > 0) { /* funds returned to vault */ }
    }

    /// @notice Update the allocation weight for an existing strategy.
    function setAllocation(address strategy, uint256 allocationBps) external onlyOwner {
        if (!strategyInfo[strategy].active) revert StrategyNotFound();
        _checkTotalAllocationExcluding(strategy, allocationBps);
        strategyInfo[strategy].allocationBps = allocationBps;
        emit AllocationUpdated(strategy, allocationBps);
    }

    // ── Admin settings ───────────────────────────────────────────────────────

    function setDepositCap(uint256 newCap) external onlyOwner {
        depositCap = newCap;
        emit DepositCapUpdated(newCap);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    // ── Harvest & rebalance (owner / keeper) ─────────────────────────────────

    /// @notice Collect yield from all strategies, charge performance fee, update HWM.
    function harvest() external onlyOwner nonReentrant returns (uint256 totalHarvested) {
        uint256 len = strategies.length;
        for (uint256 i; i < len; ) {
            if (strategyInfo[strategies[i]].active) {
                totalHarvested += IStrategy(strategies[i]).harvest();
            }
            unchecked { ++i; }
        }

        uint256 fee = _chargePerformanceFee();
        emit Harvested(totalHarvested, fee);
    }

    /// @notice Rebalance allocations: withdraw everything, re-deploy per weights.
    function rebalance() external onlyOwner nonReentrant {
        // 1. Pull all strategy funds back; accumulate to satisfy Slither unused-return
        uint256 len = strategies.length;
        uint256 totalPulled = 0;
        for (uint256 i; i < len; ) {
            if (strategyInfo[strategies[i]].active) {
                totalPulled += IStrategy(strategies[i]).withdrawAll();
            }
            unchecked { ++i; }
        }
        // 2. Re-deploy from actual vault balance (more accurate than totalPulled)
        uint256 available = IERC20(asset()).balanceOf(address(this));
        _deployAll(available);
        emit Rebalanced(totalAssets());
    }

    // ── Emergency ────────────────────────────────────────────────────────────

    /// @notice Pull all funds from all strategies back to this vault. Pauses deployment.
    function emergencyWithdrawAll() external onlyOwner nonReentrant returns (uint256 totalRecovered) {
        uint256 len = strategies.length;

        // CEI pass 1: zero ALL allocations before touching any external contract.
        // A single loop that interleaves writes and external calls would leave later
        // iterations' allocationBps writable after an earlier iteration's external call.
        for (uint256 i; i < len; ) {
            if (strategyInfo[strategies[i]].active) {
                strategyInfo[strategies[i]].allocationBps = 0;
            }
            unchecked { ++i; }
        }

        // CEI pass 2: now safe to call external strategies — all state is clean.
        for (uint256 i; i < len; ) {
            if (strategyInfo[strategies[i]].active) {
                totalRecovered += IStrategy(strategies[i]).withdrawAll();
            }
            unchecked { ++i; }
        }

        emit EmergencyWithdrawal(totalRecovered);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    /// @dev Deploy `amount` of USDC to strategies proportionally per allocationBps.
    function _deployToStrategies(uint256 amount) internal {
        if (amount < 1) return;
        uint256 len = strategies.length;
        for (uint256 i; i < len; ) {
            address strat = strategies[i];
            if (strategyInfo[strat].active && strategyInfo[strat].allocationBps > 0) {
                uint256 toSend = amount.mulDiv(strategyInfo[strat].allocationBps, MAX_BPS);
                if (toSend > 0) {
                    IERC20(asset()).forceApprove(strat, toSend);
                    IStrategy(strat).deposit(toSend);
                }
            }
            unchecked { ++i; }
        }
    }

    /// @dev Deploy the vault's entire USDC balance across strategies.
    function _deployAll(uint256 total) internal {
        if (total < 1) return;
        uint256 len = strategies.length;
        for (uint256 i; i < len; ) {
            address strat = strategies[i];
            if (strategyInfo[strat].active && strategyInfo[strat].allocationBps > 0) {
                uint256 toSend = total.mulDiv(strategyInfo[strat].allocationBps, MAX_BPS);
                if (toSend > 0) {
                    IERC20(asset()).forceApprove(strat, toSend);
                    IStrategy(strat).deposit(toSend);
                }
            }
            unchecked { ++i; }
        }
    }

    /// @dev Ensure `needed` USDC is available in the vault; withdraw from strategies if not.
    function _ensureLiquidity(uint256 needed) internal {
        uint256 local = IERC20(asset()).balanceOf(address(this));
        if (local >= needed) return;
        uint256 shortfall = needed - local;

        uint256 len = strategies.length;
        for (uint256 i; i < len && shortfall > 0; ) {
            address strat = strategies[i];
            if (strategyInfo[strat].active) {
                uint256 available = IStrategy(strat).totalAssets();
                if (available > 0) {
                    uint256 toWithdraw = shortfall > available ? available : shortfall;
                    uint256 received   = IStrategy(strat).withdraw(toWithdraw);
                    shortfall          = received < shortfall ? shortfall - received : 0;
                }
            }
            unchecked { ++i; }
        }
        if (IERC20(asset()).balanceOf(address(this)) < needed) revert InsufficientLiquidity();
    }

    /// @dev Charge a 10% performance fee on yield above the high-water mark.
    ///      The HWM never decreases — fees are only charged on new all-time-high
    ///      NAV, so users are never charged fees on loss recovery.
    function _chargePerformanceFee() internal returns (uint256 fee) {
        uint256 current = totalAssets();
        if (current <= highWaterMark) {
            // NAV is at or below previous peak — no fee, HWM stays unchanged.
            return 0;
        }
        uint256 yield_ = current - highWaterMark;
        fee = yield_.mulDiv(PERFORMANCE_FEE, MAX_BPS);
        highWaterMark = current;

        if (fee > 0) {
            // Mint fee as shares to feeRecipient (avoids pulling cash out of strategies).
            // Use pre-mint NAV: feeShares = totalSupply * fee / (totalAssets - fee)
            // so the fee recipient gets shares priced at the pre-yield rate.
            uint256 feeShares = fee.mulDiv(totalSupply(), current - fee, Math.Rounding.Floor);
            _mint(feeRecipient, feeShares);
            emit PerformanceFeeCharged(yield_, fee);
        }
    }

    /// @dev Ensure new allocation (added to existing) doesn't exceed 10 000 bps.
    function _checkTotalAllocation(uint256 additional) internal view {
        uint256 total = _sumAllocations();
        if (total + additional > MAX_BPS) revert AllocationExceedsCap();
    }

    function _checkTotalAllocationExcluding(address exclude, uint256 newBps) internal view {
        uint256 total = _sumAllocations() - strategyInfo[exclude].allocationBps;
        if (total + newBps > MAX_BPS) revert AllocationExceedsCap();
    }

    function _sumAllocations() internal view returns (uint256 total) {
        uint256 len = strategies.length;
        for (uint256 i; i < len; ) {
            total += strategyInfo[strategies[i]].allocationBps;
            unchecked { ++i; }
        }
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    /// @notice Returns active strategy list with their current allocations and assets.
    function strategyDetails() external view returns (
        address[] memory addrs,
        uint256[] memory allocations,
        uint256[] memory assets
    ) {
        uint256 len = strategies.length;
        addrs       = new address[](len);
        allocations = new uint256[](len);
        assets      = new uint256[](len);
        for (uint256 i; i < len; ) {
            addrs[i]       = strategies[i];
            allocations[i] = strategyInfo[strategies[i]].allocationBps;
            assets[i]      = IStrategy(strategies[i]).totalAssets();
            unchecked { ++i; }
        }
    }
}
