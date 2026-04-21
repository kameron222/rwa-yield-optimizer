// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RWAVault}         from "../src/RWAVault.sol";
import {Rebalancer}       from "../src/Rebalancer.sol";
import {AaveV3Strategy}   from "../src/strategies/AaveV3Strategy.sol";
import {CompoundV3Strategy} from "../src/strategies/CompoundV3Strategy.sol";
import {MorphoStrategy}   from "../src/strategies/MorphoStrategy.sol";
import {OndoStrategy}     from "../src/strategies/OndoStrategy.sol";

/// @notice Deploy the full RWA yield optimizer to Base mainnet.
///
///  Required env vars
///  ──────────────────
///  DEPLOYER_PRIVATE_KEY   — deployer / owner account
///  FEE_RECIPIENT          — address that receives performance fees
///  BASE_RPC_URL           — Base mainnet RPC (for --fork-url)
///  BASESCAN_API_KEY       — for contract verification
///
///  Run
///  ───
///  source .env
///  forge script script/Deploy.s.sol:DeployScript \
///    --rpc-url $BASE_RPC_URL \
///    --broadcast \
///    --verify \
///    -vvvv
contract DeployScript is Script {

    // ── Base mainnet ─────────────────────────────────────────────────────────
    address constant USDC          = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Aave V3
    address constant AAVE_POOL     = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address constant AAVE_A_USDC   = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;

    // Compound V3
    address constant COMET         = 0xb125E6687d4313864e53df431d5425969c15Eb2F; // native USDC market

    // Morpho (Steakhouse USDC MetaMorpho vault on Base)
    address constant MORPHO_VAULT  = 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca;

    // ── Allocation weights (bps, must sum ≤ 10 000) ──────────────────────────
    uint256 constant ALLOC_AAVE     = 3_500; // 35 %
    uint256 constant ALLOC_COMPOUND = 3_500; // 35 %
    uint256 constant ALLOC_MORPHO   = 2_000; // 20 %
    uint256 constant ALLOC_ONDO     = 1_000; // 10 % (stub)

    // ── Deposit cap: 100 k USDC ──────────────────────────────────────────────
    uint256 constant DEPOSIT_CAP    = 100_000 * 1e6;  // 100k USDC

    function run() external {
        uint256 pk           = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer     = vm.addr(pk);
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        console2.log("=== RWA Vault Deployment ===");
        console2.log("Deployer:      ", deployer);
        console2.log("Fee recipient: ", feeRecipient);
        console2.log("Chain ID:      ", block.chainid);

        vm.startBroadcast(pk);

        // 1. Deploy vault
        RWAVault vault = new RWAVault(USDC, feeRecipient, DEPOSIT_CAP);
        console2.log("RWAVault:      ", address(vault));

        // 2. Deploy strategies (vault is the caller)
        AaveV3Strategy aave = new AaveV3Strategy(USDC, address(vault), AAVE_POOL, AAVE_A_USDC);
        console2.log("AaveV3Strategy:", address(aave));

        CompoundV3Strategy compound = new CompoundV3Strategy(USDC, address(vault), COMET);
        console2.log("CompoundV3:    ", address(compound));

        MorphoStrategy morpho = new MorphoStrategy(USDC, address(vault), MORPHO_VAULT);
        console2.log("MorphoStrategy:", address(morpho));

        OndoStrategy ondo = new OndoStrategy(USDC, address(vault));
        console2.log("OndoStrategy:  ", address(ondo));

        // 3. Propose strategies (must wait STRATEGY_TIMELOCK before executing)
        vault.proposeStrategy(address(aave),     ALLOC_AAVE);
        vault.proposeStrategy(address(compound), ALLOC_COMPOUND);
        vault.proposeStrategy(address(morpho),   ALLOC_MORPHO);
        vault.proposeStrategy(address(ondo),     ALLOC_ONDO);
        console2.log("Strategies proposed - execute after 24h timelock with executeAddStrategy()");

        // 4. Deploy rebalancer
        Rebalancer rebalancer = new Rebalancer(address(vault));
        console2.log("Rebalancer:    ", address(rebalancer));

        // 5. Set risk / liquidity scores (Aave safest/most liquid, Ondo lowest)
        rebalancer.setStrategyScores(address(aave),     95, 95);
        rebalancer.setStrategyScores(address(compound), 90, 90);
        rebalancer.setStrategyScores(address(morpho),   80, 75);
        rebalancer.setStrategyScores(address(ondo),     50, 30);

        // 6. Transfer vault ownership to rebalancer
        //    Owner must then call rebalancer.acceptVaultOwnership() in a separate tx
        vault.transferOwnership(address(rebalancer));
        console2.log("Vault ownership transfer pending - call rebalancer.acceptVaultOwnership()");

        vm.stopBroadcast();

        console2.log("=== Deployment complete ===");
        console2.log("Next steps:");
        console2.log("  1. rebalancer.acceptVaultOwnership()");
        console2.log("  2. Approve deposit via UI or directly call vault.deposit()");
        console2.log("  3. Monitor APYs; keeper calls rebalancer.rebalance() when shouldRebalance()");
    }
}
