import { Dashboard } from "@/components/Dashboard";
import type { AggregatedResponse } from "@/lib/schema";

const DEPOSIT_URLS: Record<string, string> = {
  "maple-":                 "https://app.maple.finance",
  "centrifuge":             "https://app.centrifuge.io",
  "goldfinch-senior":       "https://app.goldfinch.finance",
  "credix-finance":         "https://app.credix.finance",
  "clearpool":              "https://clearpool.finance",
  "truefi":                 "https://truefi.io",
  "florence-finance":       "https://florence.finance",
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
  "ondo-usdy":              "https://ondo.finance/usdy",
  "ondo-ousg":              "https://ondo.finance/ousg",
  "ondo-global-markets":    "https://ondo.finance",
  "paxos-gold-":            "https://paxos.com/paxgold",
  "matrixdock-xaum":        "https://www.matrixdock.com",
  "realt-":                 "https://realt.co",
  "tangible-":              "https://www.tangible.store",
  "parcl":                  "https://app.parcl.co",
  "landshare":              "https://landshare.io",
};

function resolveDepositUrl(id: string): string | undefined {
  if (DEPOSIT_URLS[id]) return DEPOSIT_URLS[id];
  for (const [prefix, url] of Object.entries(DEPOSIT_URLS)) {
    if (prefix.endsWith("-") && id.startsWith(prefix)) return url;
  }
  return undefined;
}

async function getProtocols(): Promise<AggregatedResponse> {
  try {
    const { fetchMaple } = await import("@/lib/protocols/maple");
    const { fetchOndo } = await import("@/lib/protocols/ondo");
    const { fetchDefiLlamaProtocols } = await import("@/lib/protocols/defillama");
    const { getAdditionalProtocols } = await import("@/lib/protocols/additional");

    const errors: Record<string, string> = {};

    const [mapleResult, ondoResult, defiLlamaResult, additionalResult] = await Promise.allSettled([
      fetchMaple(),
      fetchOndo(),
      fetchDefiLlamaProtocols(),
      getAdditionalProtocols(),
    ]);

    const maple =
      mapleResult.status === "fulfilled"
        ? mapleResult.value
        : (errors["maple"] = (mapleResult.reason as Error)?.message ?? "Error", []);

    const ondo =
      ondoResult.status === "fulfilled"
        ? ondoResult.value
        : (errors["ondo"] = (ondoResult.reason as Error)?.message ?? "Error", []);

    const defiLlama =
      defiLlamaResult.status === "fulfilled"
        ? defiLlamaResult.value
        : (errors["defillama"] = (defiLlamaResult.reason as Error)?.message ?? "Error", []);

    const additional =
      additionalResult.status === "fulfilled"
        ? additionalResult.value
        : (errors["additional"] = (additionalResult.reason as Error)?.message ?? "Error", []);

    const allProtocols = [...additional, ...defiLlama, ...maple, ...ondo];

    const seenById = new Map();
    for (const p of allProtocols) {
      const ex = seenById.get(p.id);
      seenById.set(p.id, ex ? { ...ex, ...p, tvl: p.tvl || ex.tvl, apy: p.apy || ex.apy } : p);
    }

    const seenByContract = new Map();
    const noContract = [];
    for (const p of Array.from(seenById.values())) {
      if (p.contractAddress) {
        const key = p.contractAddress.toLowerCase();
        const ex = seenByContract.get(key);
        seenByContract.set(key, ex ? { ...ex, tvl: ex.tvl + p.tvl } : p);
      } else {
        noContract.push(p);
      }
    }

    const protocols = [...Array.from(seenByContract.values()), ...noContract]
      .map((p) => ({
        ...p,
        tvl: Math.round(p.tvl * 100) / 100,
        depositUrl: p.depositUrl ?? resolveDepositUrl(p.id),
      }))
      .sort((a, b) => b.tvl - a.tvl);

    return {
      protocols,
      fetchedAt: new Date().toISOString(),
      errors,
    };
  } catch {
    return {
      protocols: [],
      fetchedAt: new Date().toISOString(),
      errors: { server: "Failed to load protocol data" },
    };
  }
}

export default async function Home() {
  const initialData = await getProtocols();

  return (
    <main className="min-h-screen bg-[#060606]">

      {/* ── Top nav bar ────────────────────────────────────────────────── */}
      <header className="border-b border-zinc-800/80 bg-[#060606] sticky top-0 z-20">
        <div className="mx-auto max-w-[1400px] px-6 flex items-center justify-between h-12">

          {/* Wordmark */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-px h-5 bg-emerald-500" />
              <span className="text-[11px] font-bold tracking-[0.25em] uppercase text-zinc-100">
                RWA Terminal
              </span>
            </div>
            <span className="hidden sm:block text-[10px] tracking-[0.2em] uppercase text-zinc-600">
              Institutional Dashboard
            </span>
          </div>

          {/* Nav right */}
          <div className="flex items-center gap-6 text-[10px] tracking-widest uppercase">
            <span className="text-zinc-600 hidden sm:block">Data via DeFiLlama · On-chain</span>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-500 font-semibold">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Page title bar ──────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800/60 bg-[#080808]">
        <div className="mx-auto max-w-[1400px] px-6 py-5">
          <h1 className="text-[11px] font-bold tracking-[0.3em] uppercase text-zinc-500 mb-1">
            Asset Overview
          </h1>
          <p className="text-xl font-semibold text-zinc-100 tracking-tight">
            Real World Assets — Institutional Market Data
          </p>
        </div>
      </div>

      {/* ── Page body ───────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <Dashboard initialData={initialData} />
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-zinc-800/60 py-5 bg-[#060606]">
        <div className="mx-auto max-w-[1400px] px-6 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] tracking-widest uppercase text-zinc-700">
            Data · DeFiLlama · DeFiLlama Yields · On-chain · Protocol APIs
          </span>
          <span className="text-[10px] tracking-widest uppercase text-zinc-700">
            Not investment advice · For informational use only
          </span>
        </div>
      </footer>
    </main>
  );
}
