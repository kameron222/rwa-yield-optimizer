/**
 * keeper/rebalance.ts
 *
 * Keeper bot for the Rebalancer contract.
 *
 * Behaviour:
 *   • Polls shouldRebalance() every REBALANCE_POLL_MS (default 1 hour).
 *   • Watches ERC-4626 Deposit / Withdraw events on the vault; any flow > LARGE_FLOW_THRESHOLD_USDC
 *     triggers an immediate out-of-band shouldRebalance() check.
 *   • When shouldRebalance() returns true, calls rebalancer.rebalance() and logs the result.
 *   • Posts a Discord embed on every successful rebalance (optional).
 *
 * Ownership assumption:
 *   KEEPER_PRIVATE_KEY is the owner of the Rebalancer contract, which in turn owns the vault.
 *   Rebalancer.rebalance() is onlyOwner(Rebalancer), so the keeper EOA must be that owner.
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  webSocket,
  parseAbi,
  formatUnits,
  type Hash,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ── Config ─────────────────────────────────────────────────────────────────────

const RPC_URL            = requireEnv("BASE_RPC_URL");
const KEEPER_KEY         = requireEnv("KEEPER_PRIVATE_KEY") as `0x${string}`;
const VAULT_ADDRESS      = requireEnv("VAULT_ADDRESS") as Address;
const REBALANCER_ADDRESS = requireEnv("REBALANCER_ADDRESS") as Address;
const DISCORD_URL        = process.env.DISCORD_WEBHOOK_URL ?? "";

const POLL_MS            = Number(process.env.REBALANCE_POLL_MS ?? 3_600_000);   // 1 h
const LARGE_FLOW_USDC    = Number(process.env.LARGE_FLOW_THRESHOLD_USDC ?? 10_000);

// ── ABIs ───────────────────────────────────────────────────────────────────────

const REBALANCER_ABI = parseAbi([
  "function shouldRebalance() view returns (bool)",
  "function rebalance() nonpayable",
  "function lastRebalanceTime() view returns (uint256)",
  "event Rebalanced(uint256 timestamp, address[] strategies, uint256[] newAllocations)",
]);

const VAULT_ABI = parseAbi([
  "function strategyDetails() view returns (address[] addrs, uint256[] allocations, uint256[] assets)",
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
]);

const STRATEGY_ABI = parseAbi([
  "function name() view returns (string)",
]);

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
  console.log(`[${ts}] [REBALANCE] ${msg}`);
}

function err(msg: string, error?: unknown) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [REBALANCE] ERROR: ${msg}`, error ?? "");
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

async function notifyRebalanced(
  txHash: Hash,
  strategies: readonly Address[],
  allocations: readonly bigint[],
) {
  const names = await Promise.all(
    strategies.map((s) =>
      publicClient
        .readContract({ address: s, abi: STRATEGY_ABI, functionName: "name" })
        .catch(() => s),
    ),
  );

  const rows = strategies.map((_, i) =>
    `**${names[i]}** → ${(Number(allocations[i]) / 100).toFixed(0)}%`,
  );

  await discordAlert({
    embeds: [
      {
        title: "✅ Vault Rebalanced",
        color: 0x10b981,
        fields: [
          { name: "Transaction", value: `[${txHash.slice(0, 10)}...](https://basescan.org/tx/${txHash})`, inline: true },
          { name: "Timestamp", value: new Date().toUTCString(), inline: true },
          { name: "New Allocations", value: rows.join("\n") },
        ],
        footer: { text: "RWA Yield Vault — Base Mainnet" },
      },
    ],
  });
}

// ── Core logic ─────────────────────────────────────────────────────────────────

/** True if a rebalance attempt is currently in flight — prevents overlapping calls. */
let rebalancing = false;

async function tryRebalance(reason: string): Promise<void> {
  if (rebalancing) {
    log(`Skipping check (rebalance already in progress) — reason: ${reason}`);
    return;
  }

  let needed: boolean;
  try {
    needed = await publicClient.readContract({
      address: REBALANCER_ADDRESS,
      abi: REBALANCER_ABI,
      functionName: "shouldRebalance",
    });
  } catch (e) {
    err("shouldRebalance() call failed", e);
    return;
  }

  log(`shouldRebalance() = ${needed}  (trigger: ${reason})`);
  if (!needed) return;

  rebalancing = true;
  try {
    log("Sending rebalance() transaction...");
    const hash = await walletClient.writeContract({
      address: REBALANCER_ADDRESS,
      abi: REBALANCER_ABI,
      functionName: "rebalance",
    });
    log(`tx submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      err(`rebalance() reverted — tx ${hash}`);
      return;
    }
    log(`rebalance() confirmed in block ${receipt.blockNumber}`);

    // Read updated allocations for logging + Discord
    const [addrs, allocations] = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "strategyDetails",
    });

    const allocationStr = (allocations as readonly bigint[])
      .map((a, i) => `${(addrs as readonly Address[])[i].slice(0, 8)}…: ${(Number(a) / 100).toFixed(0)}%`)
      .join(" | ");
    log(`New allocations: ${allocationStr}`);

    await notifyRebalanced(hash, addrs as readonly Address[], allocations as readonly bigint[]);
  } catch (e) {
    err("rebalance() transaction failed", e);
  } finally {
    rebalancing = false;
  }
}

// ── Event watchers ─────────────────────────────────────────────────────────────

/** Cooldown: after a large-flow event triggers a check, suppress further triggers for 60 s. */
let lastEventCheck = 0;
const EVENT_CHECK_COOLDOWN_MS = 60_000;

function watchVaultEvents() {
  const thresholdRaw = BigInt(Math.floor(LARGE_FLOW_USDC * 1e6)); // USDC has 6 decimals

  const handleFlow = (assets: bigint, label: string) => {
    if (assets < thresholdRaw) return;
    const usdcAmt = formatUnits(assets, 6);
    log(`Large ${label} detected: $${Number(usdcAmt).toLocaleString()} USDC — queuing rebalance check`);

    const now = Date.now();
    if (now - lastEventCheck < EVENT_CHECK_COOLDOWN_MS) {
      log("Event-triggered check suppressed (cooldown active)");
      return;
    }
    lastEventCheck = now;
    void tryRebalance(`large ${label} $${Number(usdcAmt).toFixed(0)}`);
  };

  publicClient.watchContractEvent({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    eventName: "Deposit",
    onLogs: (logs) => {
      for (const l of logs) {
        const { assets } = l.args as { assets: bigint };
        handleFlow(assets, "deposit");
      }
    },
    onError: (e) => err("Deposit watcher error", e),
  });

  publicClient.watchContractEvent({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    eventName: "Withdraw",
    onLogs: (logs) => {
      for (const l of logs) {
        const { assets } = l.args as { assets: bigint };
        handleFlow(assets, "withdrawal");
      }
    },
    onError: (e) => err("Withdraw watcher error", e),
  });

  log(`Watching vault events — alert threshold: $${LARGE_FLOW_USDC.toLocaleString()} USDC`);
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  log("=".repeat(60));
  log(`Keeper started`);
  log(`Vault:      ${VAULT_ADDRESS}`);
  log(`Rebalancer: ${REBALANCER_ADDRESS}`);
  log(`Keeper:     ${account.address}`);
  log(`Poll every: ${POLL_MS / 1000}s  |  Large flow: $${LARGE_FLOW_USDC.toLocaleString()} USDC`);
  log("=".repeat(60));

  // Verify keeper balance
  const bal = await publicClient.getBalance({ address: account.address });
  log(`Keeper ETH balance: ${formatUnits(bal, 18)} ETH`);
  if (bal < 1_000_000_000_000_000n) {
    err("WARNING: Keeper balance < 0.001 ETH — may not have enough gas");
  }

  // Run immediately on startup, then on interval
  await tryRebalance("startup");
  setInterval(() => void tryRebalance("hourly poll"), POLL_MS);

  // Subscribe to vault events for immediate large-flow response
  watchVaultEvents();

  log("Keeper running. Press Ctrl+C to stop.");
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
