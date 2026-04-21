import { NextResponse } from "next/server";
import { fetchMaple } from "@/lib/protocols/maple";
import { fetchOndo } from "@/lib/protocols/ondo";
import { fetchDefiLlamaProtocols } from "@/lib/protocols/defillama";
import { getAdditionalProtocols } from "@/lib/protocols/additional";
import type { AggregatedResponse, Protocol } from "@/lib/schema";

// Central deposit URL registry — keyed by protocol id (exact or prefix ending in "-")
const DEPOSIT_URLS: Record<string, string> = {
  // Lending / Credit
  "maple-":                 "https://app.maple.finance",
  "centrifuge":             "https://app.centrifuge.io",
  "goldfinch-senior":       "https://app.goldfinch.finance",
  "credix-finance":         "https://app.credix.finance",
  "clearpool":              "https://clearpool.finance",
  "truefi":                 "https://truefi.io",
  "florence-finance":       "https://florence.finance",
  // Tokenized Treasuries
  "blackrock-buidl":        "https://securitize.io",
  "franklin-templeton-":    "https://www.franklintempleton.com",
  "superstate-ustb":        "https://superstate.co",
  "superstate-uscc":        "https://superstate.co",
  "openeden-":              "https://app.openeden.com",
  "matrixdock-stbt":        "https://www.matrixdock.com",
  "backedfi-":              "https://backed.fi",
  "hashnote-usyc":          "https://hashnote.com",
  "mountain-protocol-":     "https://mountainprotocol.com",
  "ethena-usde":            "https://app.ethena.fi",
  "ethena-usdtb":           "https://app.ethena.fi",
  // Ondo
  "ondo-usdy":              "https://ondo.finance/usdy",
  "ondo-ousg":              "https://ondo.finance/ousg",
  "ondo-global-markets":    "https://ondo.finance",
  // Commodities
  "paxos-gold-":            "https://paxos.com/paxgold",
  "matrixdock-xaum":        "https://www.matrixdock.com",
  // Real Estate
  "realt-":                 "https://realt.co",
  "tangible-":              "https://www.tangible.store",
  "parcl":                  "https://app.parcl.co",
  "landshare":              "https://landshare.io",
};

function resolveDepositUrl(id: string): string | undefined {
  // Exact match first, then prefix match for dynamic IDs (e.g. maple-{uuid})
  if (DEPOSIT_URLS[id]) return DEPOSIT_URLS[id];
  for (const [prefix, url] of Object.entries(DEPOSIT_URLS)) {
    if (prefix.endsWith("-") && id.startsWith(prefix)) return url;
  }
  return undefined;
}

export const revalidate = 300; // ISR: revalidate every 5 minutes

export async function GET() {
  const errors: Record<string, string> = {};

  const results = await Promise.allSettled([
    fetchMaple(),
    fetchOndo(),
    fetchDefiLlamaProtocols(),
    getAdditionalProtocols(),
  ]);

  const [mapleResult, ondoResult, defiLlamaResult, additionalResult] = results;

  const mapleProtocols: Protocol[] =
    mapleResult.status === "fulfilled"
      ? mapleResult.value
      : (errors["maple"] = mapleResult.reason?.message ?? "Unknown error", []);

  const ondoProtocols: Protocol[] =
    ondoResult.status === "fulfilled"
      ? ondoResult.value
      : (errors["ondo"] = ondoResult.reason?.message ?? "Unknown error", []);

  const defiLlamaProtocols: Protocol[] =
    defiLlamaResult.status === "fulfilled"
      ? defiLlamaResult.value
      : (errors["defillama"] = defiLlamaResult.reason?.message ?? "Unknown error", []);

  const additionalProtocols: Protocol[] =
    additionalResult.status === "fulfilled"
      ? additionalResult.value
      : (errors["additional"] = additionalResult.reason?.message ?? "Unknown error", []);

  const allProtocols = [
    ...additionalProtocols,
    ...defiLlamaProtocols,
    ...mapleProtocols,
    ...ondoProtocols,
  ];

  // Deduplicate by id; merge TVL/APY preferring non-zero values
  const seenById = new Map<string, Protocol>();
  for (const p of allProtocols) {
    const existing = seenById.get(p.id);
    if (existing) {
      seenById.set(p.id, {
        ...existing,
        ...p,
        tvl: p.tvl || existing.tvl,
        apy: p.apy || existing.apy,
      });
    } else {
      seenById.set(p.id, p);
    }
  }

  // Secondary dedup: collapse entries that share the same contract address (keep highest TVL)
  const seenByContract = new Map<string, Protocol>();
  const noContract: Protocol[] = [];
  for (const p of Array.from(seenById.values())) {
    if (p.contractAddress) {
      const key = p.contractAddress.toLowerCase();
      const existing = seenByContract.get(key);
      if (!existing || p.tvl > existing.tvl) {
        seenByContract.set(key, { ...p, tvl: (existing?.tvl ?? 0) + p.tvl });
      }
    } else {
      noContract.push(p);
    }
  }

  // Round TVL, inject deposit URLs, sort by TVL descending
  const protocols = [...Array.from(seenByContract.values()), ...noContract]
    .map((p) => ({
      ...p,
      tvl: Math.round(p.tvl * 100) / 100,
      depositUrl: p.depositUrl ?? resolveDepositUrl(p.id),
    }))
    .sort((a, b) => b.tvl - a.tvl);

  const response: AggregatedResponse = {
    protocols,
    fetchedAt: new Date().toISOString(),
    errors,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
    },
  });
}
