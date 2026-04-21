// Maple Finance — data sourced from DeFiLlama yields API (project: "maple").
// api.maple.finance REST API returns 404 on all known endpoints as of 2026.

import type { Protocol } from "@/lib/schema";
import { getPoolsByProject } from "./llamaYields";

const MAPLE_MOCK: Protocol[] = [
  {
    id: "maple-syrup-usdc",
    name: "Maple Syrup USDC",
    apy: 4.21,
    tvl: 3_385_000_000,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "medium",
    contractAddress: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b",
    lastUpdated: new Date().toISOString(),
    category: "Lending",
  },
  {
    id: "maple-syrup-usdt",
    name: "Maple Syrup USDT",
    apy: 3.63,
    tvl: 2_440_000_000,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "medium",
    contractAddress: undefined,
    lastUpdated: new Date().toISOString(),
    category: "Lending",
  },
];

// poolMeta → lockup days heuristic
function inferLockup(poolMeta: string | null): number {
  if (!poolMeta) return 0;
  const m = poolMeta.toLowerCase();
  if (m.includes("open term")) return 0;
  if (m.includes("30")) return 30;
  if (m.includes("90")) return 90;
  return 0;
}

export async function fetchMaple(): Promise<Protocol[]> {
  try {
    const pools = await getPoolsByProject("maple");

    if (pools.length === 0) return MAPLE_MOCK;

    return pools.map((pool) => ({
      id: `maple-${pool.pool}`,
      name: `Maple ${pool.symbol}`,
      apy: pool.apy,
      tvl: pool.tvlUsd,
      chain: pool.chain,
      lockupDays: inferLockup(pool.poolMeta),
      riskTier: "medium" as const,
      contractAddress: pool.underlyingTokens?.[0] ?? undefined,
      lastUpdated: new Date().toISOString(),
      category: "Lending",
    }));
  } catch {
    return MAPLE_MOCK;
  }
}
