// DeFiLlama — credit/lending protocols.
// Two sources:
//   YIELDS_PROJECTS → DeFiLlama yields API (real APY + pool TVL)
//   TVL_PROTOCOLS   → DeFiLlama protocols TVL API + researched static APY

import type { Protocol } from "@/lib/schema";
import { getPoolsByProject, getProtocolTvl } from "./llamaYields";

// ── Yield-API protocols ────────────────────────────────────────────────────

interface YieldProject {
  projectSlug: string; // DeFiLlama yields project name
  id: string;
  name: string;
  chain: string;
  lockupDays: number;
  riskTier: Protocol["riskTier"];
  contractAddress?: string;
  category: string;
  fallbackApy: number;
  fallbackTvl: number;
}

const YIELDS_PROJECTS: YieldProject[] = [
  {
    projectSlug: "goldfinch",
    id: "goldfinch-senior",
    name: "Goldfinch Senior Pool",
    chain: "Ethereum",
    lockupDays: 90,
    riskTier: "high",
    contractAddress: "0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822",
    category: "Credit",
    fallbackApy: 10.0,
    fallbackTvl: 1_570_352,
  },
  {
    projectSlug: "credix",
    id: "credix-finance",
    name: "Credix Finance",
    chain: "Solana",
    lockupDays: 180,
    riskTier: "high",
    contractAddress: undefined,
    category: "Credit",
    fallbackApy: 0.1,
    fallbackTvl: 13_616_898,
  },
];

// ── TVL-only protocols (no APY from yields API) ────────────────────────────

interface TvlProtocol {
  slug: string; // DeFiLlama protocol slug (verified)
  id: string;
  name: string;
  chain: string;
  staticApy: number;
  lockupDays: number;
  riskTier: Protocol["riskTier"];
  contractAddress?: string;
  category: string;
  fallbackTvl: number;
}

const TVL_PROTOCOLS: TvlProtocol[] = [
  {
    slug: "centrifuge-protocol",
    id: "centrifuge",
    name: "Centrifuge",
    chain: "Ethereum",
    staticApy: 8.5,
    lockupDays: 30,
    riskTier: "medium",
    category: "RWA Pools",
    fallbackTvl: 1_989_328_282,
  },
  {
    slug: "clearpool-tpool",
    id: "clearpool",
    name: "Clearpool",
    chain: "Ethereum",
    staticApy: 9.5,
    lockupDays: 0,
    riskTier: "high",
    contractAddress: undefined,
    category: "Credit",
    fallbackTvl: 40_324_793,
  },
  {
    slug: "truefi",
    id: "truefi",
    name: "TrueFi",
    chain: "Ethereum",
    staticApy: 8.0,
    lockupDays: 90,
    riskTier: "high",
    contractAddress: undefined,
    category: "Credit",
    fallbackTvl: 21_754,
  },
  {
    slug: "florence-finance",
    id: "florence-finance",
    name: "Florence Finance",
    chain: "Ethereum",
    staticApy: 9.0,
    lockupDays: 90,
    riskTier: "high",
    contractAddress: undefined,
    category: "Credit",
    fallbackTvl: 0,
  },
];

// ── Fetcher ────────────────────────────────────────────────────────────────

async function fetchYieldsProjects(): Promise<Protocol[]> {
  const results = await Promise.allSettled(
    YIELDS_PROJECTS.map(async (def) => {
      const pools = await getPoolsByProject(def.projectSlug);
      // Sum TVL across all pools; use APY from the highest-TVL pool
      if (pools.length === 0) {
        return { ...def, apy: def.fallbackApy, tvl: def.fallbackTvl };
      }
      const sorted = [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd);
      const tvl = pools.reduce((s, p) => s + p.tvlUsd, 0);
      const apy = sorted[0].apy;
      return { ...def, apy, tvl };
    })
  );

  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => {
      const v = (r as PromiseFulfilledResult<YieldProject & { apy: number; tvl: number }>).value;
      return {
        id: v.id,
        name: v.name,
        apy: v.apy,
        tvl: v.tvl,
        chain: v.chain,
        lockupDays: v.lockupDays,
        riskTier: v.riskTier,
        contractAddress: v.contractAddress,
        lastUpdated: new Date().toISOString(),
        category: v.category,
      } satisfies Protocol;
    });
}

async function fetchTvlProtocols(): Promise<Protocol[]> {
  const results = await Promise.allSettled(
    TVL_PROTOCOLS.map(async (def) => {
      const tvl = await getProtocolTvl(def.slug);
      return { ...def, tvl: tvl ?? def.fallbackTvl };
    })
  );

  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => {
      const v = (r as PromiseFulfilledResult<TvlProtocol & { tvl: number }>).value;
      return {
        id: v.id,
        name: v.name,
        apy: v.staticApy,
        tvl: v.tvl,
        chain: v.chain,
        lockupDays: v.lockupDays,
        riskTier: v.riskTier,
        contractAddress: v.contractAddress,
        lastUpdated: new Date().toISOString(),
        category: v.category,
      } satisfies Protocol;
    })
    .filter((p) => p.tvl > 0); // drop protocols with no TVL
}

export async function fetchDefiLlamaProtocols(): Promise<Protocol[]> {
  const [yieldsResult, tvlResult] = await Promise.allSettled([
    fetchYieldsProjects(),
    fetchTvlProtocols(),
  ]);
  const yields = yieldsResult.status === "fulfilled" ? yieldsResult.value : [];
  const tvl = tvlResult.status === "fulfilled" ? tvlResult.value : [];
  return [...yields, ...tvl];
}
