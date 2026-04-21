// Ondo Finance — data sourced from DeFiLlama yields API (project: "ondo-yield-assets").
// Ondo does not have a public REST API; on-chain reads require RPC access.

import type { Protocol } from "@/lib/schema";
import { getPoolsByProject } from "./llamaYields";

const ONDO_MOCK: Protocol[] = [
  {
    id: "ondo-usdy-eth",
    name: "Ondo USDY",
    apy: 3.55,
    tvl: 585_705_236,
    chain: "Ethereum",
    lockupDays: 40,
    riskTier: "low",
    contractAddress: "0x96F6ef951840721AdBF46Ac996b59E0235CB985C",
    lastUpdated: new Date().toISOString(),
    category: "Yield-Bearing Stablecoin",
  },
  {
    id: "ondo-ousg-eth",
    name: "Ondo OUSG",
    apy: 3.47,
    tvl: 306_382_173,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92",
    lastUpdated: new Date().toISOString(),
    category: "Tokenized T-Bills",
  },
];

// Map DeFiLlama pool symbols/meta to product metadata.
// USDYC ("Cooking") is the same contract/product as USDY in a pending state — merge into USDY.
const SYMBOL_CANONICAL: Record<string, string> = { USDYC: "USDY" };

const PRODUCT_META: Record<string, { name: string; contract: string; lockupDays: number; category: string }> = {
  USDY: {
    name: "Ondo USDY",
    contract: "0x96F6ef951840721AdBF46Ac996b59E0235CB985C",
    lockupDays: 40,
    category: "Yield-Bearing Stablecoin",
  },
  OUSG: {
    name: "Ondo OUSG",
    contract: "0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92",
    lockupDays: 0,
    category: "Tokenized T-Bills",
  },
};

export async function fetchOndo(): Promise<Protocol[]> {
  try {
    const pools = await getPoolsByProject("ondo-yield-assets");

    if (pools.length === 0) return ONDO_MOCK;

    // Normalize symbol (collapse USDYC → USDY), then aggregate TVL across all chains per product.
    const bySymbol = new Map<string, { totalTvl: number; apy: number; topChain: string }>();

    for (const pool of pools) {
      const symbol = SYMBOL_CANONICAL[pool.symbol] ?? pool.symbol;
      const existing = bySymbol.get(symbol);
      if (!existing) {
        bySymbol.set(symbol, { totalTvl: pool.tvlUsd, apy: pool.apy, topChain: pool.chain });
      } else {
        // Accumulate TVL; keep APY from the highest-TVL chain (first seen with largest value)
        const apy = pool.tvlUsd > existing.totalTvl ? pool.apy : existing.apy;
        bySymbol.set(symbol, { totalTvl: existing.totalTvl + pool.tvlUsd, apy, topChain: existing.topChain });
      }
    }

    return Array.from(bySymbol.entries()).map(([symbol, data]) => {
      const meta = PRODUCT_META[symbol];
      return {
        id: `ondo-${symbol.toLowerCase()}`,
        name: meta?.name ?? `Ondo ${symbol}`,
        apy: data.apy,
        tvl: data.totalTvl,
        chain: data.topChain,
        lockupDays: meta?.lockupDays ?? 0,
        riskTier: "low" as const,
        contractAddress: meta?.contract,
        lastUpdated: new Date().toISOString(),
        category: meta?.category ?? "Tokenized Assets",
      };
    });
  } catch {
    return ONDO_MOCK;
  }
}
