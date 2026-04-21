// ── Contract addresses ────────────────────────────────────────────────────────
// Set NEXT_PUBLIC_VAULT_ADDRESS after deploying via forge script Deploy.s.sol

export const VAULT_ADDRESS = (
  process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

export const IS_DEPLOYED =
  VAULT_ADDRESS !== "0x0000000000000000000000000000000000000000";

// ── Strategy metadata (populated after deployment) ───────────────────────────
export const STRATEGY_META: Record<
  string,
  { name: string; protocol: string; color: string }
> = {
  // Fill in after deploying — key is lowercase strategy address
  // "0xabc...": { name: "Aave V3 USDC Strategy", protocol: "Aave", color: "#10b981" },
};

// Strategy colors by index (order matches Deploy.s.sol: Aave, Compound, Morpho, Ondo)
export const STRATEGY_COLORS = ["#10b981", "#0ea5e9", "#7c3aed", "#f59e0b"];

// ── RWAVault ABI (ERC-4626 + custom functions) ────────────────────────────────
export const RWAVAULT_ABI = [
  // ── ERC-4626 reads ───────────────────────────────────────────────────────────
  {
    inputs: [],
    name: "totalAssets",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "shares", type: "uint256" }],
    name: "convertToAssets",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "assets", type: "uint256" }],
    name: "convertToShares",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "asset",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  // ── ERC-4626 writes ──────────────────────────────────────────────────────────
  {
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    name: "deposit",
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    name: "withdraw",
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    name: "redeem",
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ── Vault-specific reads ─────────────────────────────────────────────────────
  {
    inputs: [],
    name: "depositCap",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "highWaterMark",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "PERFORMANCE_FEE",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "feeRecipient",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "strategyDetails",
    outputs: [
      { name: "addrs", type: "address[]" },
      { name: "allocations", type: "uint256[]" },
      { name: "assets", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // ── Events ───────────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "assets", type: "uint256" },
      { indexed: false, name: "shares", type: "uint256" },
    ],
    name: "Deposit",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "receiver", type: "address" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "assets", type: "uint256" },
      { indexed: false, name: "shares", type: "uint256" },
    ],
    name: "Withdraw",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "yield_", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
    name: "PerformanceFeeCharged",
    type: "event",
  },
] as const;

// ── ERC-20 minimal ABI (for USDC approve/allowance/balance) ──────────────────
export const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── IStrategy minimal ABI (for reading name() per strategy) ──────────────────
export const ISTRATEGY_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "estimatedAPY",
    outputs: [{ name: "bps", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalAssets",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
