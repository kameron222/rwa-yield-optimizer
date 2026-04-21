// Shared DeFiLlama yields pool fetcher — called once and cached per request cycle.
// Individual protocol fetchers filter from this shared dataset.

export interface LlamaPool {
  pool: string;
  project: string;
  chain: string;
  symbol: string;
  apy: number;
  apyBase: number;
  apyReward: number;
  tvlUsd: number;
  poolMeta: string | null;
  rewardTokens: string[] | null;
  underlyingTokens: string[] | null;
}

let _cachedPools: LlamaPool[] | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getAllPools(): Promise<LlamaPool[]> {
  const now = Date.now();
  if (_cachedPools && now - _cacheTime < CACHE_TTL_MS) return _cachedPools;

  // Note: `next: { revalidate }` is intentionally omitted — the response is ~16MB and
  // exceeds Next.js's 2MB fetch cache limit. We use the module-level in-memory cache instead.
  const res = await fetch("https://yields.llama.fi/pools", {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`DeFiLlama yields API ${res.status}`);

  const json = await res.json();
  const pools: LlamaPool[] = json?.data ?? [];

  _cachedPools = pools;
  _cacheTime = now;
  return pools;
}

export async function getPoolsByProject(project: string): Promise<LlamaPool[]> {
  const pools = await getAllPools();
  return pools.filter((p) => p.project === project);
}

/** Fetch a single protocol's TVL from the DeFiLlama protocols endpoint */
export async function getProtocolTvl(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.llama.fi/tvl/${slug}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const tvl = await res.json();
    return typeof tvl === "number" ? tvl : null;
  } catch {
    return null;
  }
}
