/**
 * keeper/harvest.ts
 *
 * Keeper bot that calls harvest() on the RWA Vault daily.
 *
 * Behaviour:
 *   • Runs harvest() immediately on startup, then every HARVEST_INTERVAL_MS (default 24 h).
 *   • Reads per-strategy yield breakdown from strategyDetails() before and after harvest.
 *   • Reads the Harvested event from the receipt to get totalHarvested + feeCharged.
 *   • Posts a Discord embed with the full harvest report.
 *
 * Ownership assumption:
 *   KEEPER_PRIVATE_KEY must be the direct owner of the RWAVault contract (i.e. the vault owner
 *   has NOT been transferred to the Rebalancer, or a harvest() pass-through has been added to
 *   the Rebalancer). If the Rebalancer owns the vault, add a harvest() forwarder to Rebalancer
 *   and update the contract address + ABI here.
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  webSocket,
  parseAbi,
  parseAbiItem,
  formatUnits,
  decodeEventLog,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ── Config ─────────────────────────────────────────────────────────────────────

const RPC_URL        = requireEnv("BASE_RPC_URL");
const KEEPER_KEY     = requireEnv("KEEPER_PRIVATE_KEY") as `0x${string}`;
const VAULT_ADDRESS  = requireEnv("VAULT_ADDRESS") as Address;
const DISCORD_URL    = process.env.DISCORD_WEBHOOK_URL ?? "";

const INTERVAL_MS    = Number(process.env.HARVEST_INTERVAL_MS ?? 86_400_000); // 24 h

// ── ABIs ───────────────────────────────────────────────────────────────────────

const VAULT_ABI = parseAbi([
  "function harvest() nonpayable returns (uint256 totalHarvested)",
  "function highWaterMark() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function PERFORMANCE_FEE() view returns (uint256)",
  "function strategyDetails() view returns (address[] addrs, uint256[] allocations, uint256[] assets)",
  "event Harvested(uint256 totalHarvested, uint256 feeCharged)",
]);

const STRATEGY_ABI = parseAbi([
  "function name() view returns (string)",
  "function estimatedAPY() view returns (uint256 bps)",
  "function totalAssets() view returns (uint256)",
]);

const HARVESTED_EVENT = parseAbiItem(
  "event Harvested(uint256 totalHarvested, uint256 feeCharged)",
);

// ── Clients ────────────────────────────────────────────────────────────────────

const account = privateKeyToAccount(KEEPER_KEY);

const publicClient = createPublicClient({
  chain: base,
  transport: webSocket(RPC_URL, {
    reconnect: { attempts: Infinity, delay: 5_000 },
    keepAlive: { interval: 30_000 },
  }),
});

const walletClient = createWalletClient({
  chain: base,
  transport: webSocket(RPC_URL),
  account,
});

// ── Logging ────────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [HARVEST] ${msg}`);
}

function err(msg: string, error?: unknown) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [HARVEST] ERROR: ${msg}`, error ?? "");
}

// ── Discord ────────────────────────────────────────────────────────────────────

async function discordAlert(content: object) {
  if (!DISCORD_URL) return;
  try {
    const res = await fetch(DISCORD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    if (!res.ok) err(`Discord responded ${res.status}`);
  } catch (e) {
    err("Discord webhook failed", e);
  }
}

interface HarvestReport {
  txHash: string;
  blockNumber: bigint;
  totalHarvested: bigint;
  feeCharged: bigint;
  totalAssets: bigint;
  hwm: bigint;
  strategies: StrategyRow[];
}

interface StrategyRow {
  address: Address;
  name: string;
  assets: bigint;
  allocationPct: number;
  apyBps: bigint;
}

async function notifyHarvested(report: HarvestReport) {
  const fmtUsdc = (n: bigint) => `$${Number(formatUnits(n, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  const stratRows = report.strategies.map(
    (s) =>
      `**${s.name}**  ${s.allocationPct.toFixed(0)}% alloc · ${fmtUsdc(s.assets)} TVL · ${(Number(s.apyBps) / 100).toFixed(2)}% APY`,
  );

  const yieldColor = report.totalHarvested > 0n ? 0x10b981 : 0x6b7280;

  await discordAlert({
    embeds: [
      {
        title: report.totalHarvested > 0n ? "🌾 Harvest Complete" : "🌾 Harvest — No Yield",
        color: yieldColor,
        fields: [
          {
            name: "Transaction",
            value: `[${report.txHash.slice(0, 10)}…](https://basescan.org/tx/${report.txHash})`,
            inline: true,
          },
          { name: "Block", value: report.blockNumber.toString(), inline: true },
          { name: "\u200b", value: "\u200b", inline: true },
          {
            name: "Yield Harvested",
            value: fmtUsdc(report.totalHarvested),
            inline: true,
          },
          {
            name: "Performance Fee (10%)",
            value: fmtUsdc(report.feeCharged),
            inline: true,
          },
          {
            name: "Net to Depositors",
            value: fmtUsdc(report.totalHarvested - report.feeCharged),
            inline: true,
          },
          {
            name: "Total Vault NAV",
            value: fmtUsdc(report.totalAssets),
            inline: true,
          },
          {
            name: "High-Water Mark",
            value: fmtUsdc(report.hwm),
            inline: true,
          },
          {
            name: "Strategy Breakdown",
            value: stratRows.length > 0 ? stratRows.join("\n") : "No active strategies",
          },
        ],
        footer: { text: "RWA Yield Vault — Base Mainnet" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

// ── Core logic ─────────────────────────────────────────────────────────────────

async function runHarvest(): Promise<void> {
  log("Starting harvest...");

  // Snapshot strategy state before harvest
  let strategies: StrategyRow[] = [];
  try {
    const [addrs, allocations, assets] = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "strategyDetails",
    }) as [readonly Address[], readonly bigint[], readonly bigint[]];

    const names = await Promise.all(
      addrs.map((a: Address) =>
        publicClient
          .readContract({ address: a, abi: STRATEGY_ABI, functionName: "name" })
          .catch(() => a as string),
      ),
    );
    const apys = await Promise.all(
      addrs.map((a: Address) =>
        publicClient
          .readContract({ address: a, abi: STRATEGY_ABI, functionName: "estimatedAPY" })
          .catch(() => 0n),
      ),
    );

    const totalAlloc = allocations.reduce((s: bigint, a: bigint) => s + a, 0n) || 1n;
    strategies = addrs.map((a: Address, i: number) => ({
      address: a,
      name: names[i] as string,
      assets: assets[i],
      allocationPct: Number((allocations[i] * 100n) / totalAlloc),
      apyBps: apys[i] as bigint,
    }));

    const stratStr = strategies
      .map((s: StrategyRow) => `${s.name}: ${formatUnits(s.assets, 6)} USDC (${s.allocationPct}%)`)
      .join(", ");
    log(`Pre-harvest strategy snapshot: ${stratStr}`);
  } catch (e) {
    err("Failed to read strategy details — continuing with harvest anyway", e);
  }

  // Submit harvest transaction
  let txHash: `0x${string}`;
  try {
    txHash = await walletClient.writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "harvest",
    });
    log(`harvest() tx submitted: ${txHash}`);
  } catch (e) {
    err("Failed to submit harvest() transaction", e);
    return;
  }

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    err(`harvest() reverted — tx ${txHash}`);
    return;
  }
  log(`harvest() confirmed in block ${receipt.blockNumber}`);

  // Decode Harvested event from logs
  let totalHarvested = 0n;
  let feeCharged = 0n;
  for (const l of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: [HARVESTED_EVENT], ...l });
      if (decoded.eventName === "Harvested") {
        totalHarvested = decoded.args.totalHarvested;
        feeCharged = decoded.args.feeCharged;
      }
    } catch {
      // Not the event we're looking for
    }
  }

  log(
    `Yield harvested: ${formatUnits(totalHarvested, 6)} USDC | ` +
    `Performance fee: ${formatUnits(feeCharged, 6)} USDC`,
  );

  // Read updated vault state
  const [totalAssets, hwm] = await Promise.all([
    publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "totalAssets" }),
    publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "highWaterMark" }),
  ]);

  log(`Post-harvest NAV: ${formatUnits(totalAssets, 6)} USDC | HWM: ${formatUnits(hwm, 6)} USDC`);

  await notifyHarvested({
    txHash,
    blockNumber: receipt.blockNumber,
    totalHarvested,
    feeCharged,
    totalAssets,
    hwm,
    strategies,
  });
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  log("=".repeat(60));
  log("Harvest keeper started");
  log(`Vault:    ${VAULT_ADDRESS}`);
  log(`Keeper:   ${account.address}`);
  log(`Interval: ${INTERVAL_MS / 3_600_000}h`);
  log("=".repeat(60));

  const bal = await publicClient.getBalance({ address: account.address });
  log(`Keeper ETH balance: ${formatUnits(bal, 18)} ETH`);
  if (bal < 1_000_000_000_000_000n) {
    err("WARNING: Keeper balance < 0.001 ETH — may not have enough gas");
  }

  // Run immediately on startup
  await runHarvest();

  // Then run on interval
  setInterval(() => void runHarvest(), INTERVAL_MS);
  log("Harvest keeper running. Press Ctrl+C to stop.");
}

// ── Util ───────────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

main().catch((e) => {
  err("Fatal error in main()", e);
  process.exit(1);
});
