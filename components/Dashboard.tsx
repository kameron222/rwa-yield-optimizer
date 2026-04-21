"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CategorySection, type AccentColor } from "./CategorySection";
import type { AggregatedResponse, Protocol } from "@/lib/schema";

function fmt(tvl: number): string {
  if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(2)}B`;
  if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(1)}M`;
  return `$${tvl.toLocaleString()}`;
}

async function fetchProtocols(): Promise<AggregatedResponse> {
  const res = await fetch("/api/protocols");
  if (!res.ok) throw new Error("Failed to fetch protocols");
  return res.json();
}

// ── Section definitions — order determines display order ──────────────────

interface Section {
  key: string;
  label: string;
  description: string;
  accent: AccentColor;
  matchCategories: string[];
}

const SECTIONS: Section[] = [
  {
    key: "treasury",
    label: "Treasury & Fixed Income",
    description: "Tokenized government bonds, money markets, and yield-bearing stablecoins",
    accent: "emerald",
    matchCategories: [
      "Tokenized T-Bills", "Tokenized Money Market", "Money Market Fund",
      "Yield-Bearing Stablecoin", "Tokenized Bonds",
    ],
  },
  {
    key: "basis",
    label: "Basis Trading & Structured Products",
    description: "Delta-neutral yield strategies and structured RWA instruments",
    accent: "purple",
    matchCategories: ["Basis Trading"],
  },
  {
    key: "credit",
    label: "Credit & Private Lending",
    description: "Institutional credit facilities, private credit pools, and on-chain lending",
    accent: "amber",
    matchCategories: ["Credit", "Lending", "RWA Pools"],
  },
  {
    key: "realestate",
    label: "Real Estate",
    description: "Tokenized property, rental yield tokens, and real estate price derivatives",
    accent: "blue",
    matchCategories: ["Real Estate"],
  },
  {
    key: "commodity",
    label: "Commodities",
    description: "Tokenized physical precious metals and hard assets on-chain",
    accent: "orange",
    matchCategories: ["Commodity"],
  },
];

interface Props {
  initialData: AggregatedResponse;
}

export function Dashboard({ initialData }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["protocols"],
    queryFn: fetchProtocols,
    initialData,
    refetchInterval: 5 * 60 * 1000,
  });

  const protocols: Protocol[] = data?.protocols ?? [];
  const fetchedAt = data?.fetchedAt ? new Date(data.fetchedAt) : new Date();

  const totalAum = protocols.reduce((s, p) => s + p.tvl, 0);
  const yieldProtocols = protocols.filter((p) => p.apy > 0);
  const avgApy = yieldProtocols.length
    ? yieldProtocols.reduce((s, p) => s + p.apy, 0) / yieldProtocols.length
    : 0;
  const lowRiskTvl = protocols.filter((p) => p.riskTier === "low").reduce((s, p) => s + p.tvl, 0);
  const lowRiskPct = totalAum > 0 ? (lowRiskTvl / totalAum) * 100 : 0;

  // Partition protocols into sections
  const grouped = SECTIONS.map((section) => ({
    ...section,
    protocols: protocols
      .filter((p) => section.matchCategories.includes(p.category ?? ""))
      .sort((a, b) => b.tvl - a.tvl),
  })).filter((s) => s.protocols.length > 0);

  // Any protocol not matched by any section
  const matchedIds = new Set(grouped.flatMap((s) => s.protocols.map((p) => p.id)));
  const uncategorized = protocols.filter((p) => !matchedIds.has(p.id));

  return (
    <div className="space-y-0">

      {/* ── Top metrics bar ─────────────────────────────────────────────── */}
      <div className="border border-zinc-800 bg-[#0a0a0a] mb-6">
        {/* Ticker-style label row */}
        <div className="border-b border-zinc-800/80 px-5 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-zinc-500">
              RWA Markets Overview
            </span>
            {isLoading && (
              <span className="text-[10px] tracking-widest uppercase text-zinc-700 animate-pulse">
                Refreshing…
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/vault"
              className="text-[10px] font-mono tracking-[0.12em] uppercase px-3 py-1 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 rounded-sm transition-colors"
            >
              Yield Vault ↗
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] tracking-widest uppercase text-zinc-500">
                {fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {" · "}
                {fetchedAt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Metric columns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-zinc-800/80">
          {[
            { label: "Total AUM", value: fmt(totalAum), sub: `Across ${protocols.length} protocols`, accent: "text-emerald-400" },
            { label: "Avg Yield", value: `${avgApy.toFixed(2)}%`, sub: `${yieldProtocols.length} yield-bearing`, accent: "text-zinc-100" },
            { label: "Low Risk AUM", value: fmt(lowRiskTvl), sub: `${lowRiskPct.toFixed(0)}% of total`, accent: "text-zinc-100" },
            { label: "Asset Classes", value: String(grouped.length), sub: `${protocols.length} total protocols`, accent: "text-zinc-100" },
          ].map(({ label, value, sub, accent }) => (
            <div key={label} className="px-5 py-4">
              <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-zinc-600 mb-1">{label}</div>
              <div className={`text-2xl font-bold tabular-nums font-mono tracking-tight ${accent}`}>{value}</div>
              <div className="text-[11px] text-zinc-600 mt-0.5 tracking-wide">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Data source errors ───────────────────────────────────────────── */}
      {data?.errors && Object.keys(data.errors).length > 0 && (
        <div className="border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400 tracking-wide mb-4 font-mono">
          ⚠ PARTIAL DATA — live feeds unavailable for:{" "}
          {Object.keys(data.errors).map((k) => k.toUpperCase()).join(", ")}
          . Fallback data in use. Auto-retrying.
        </div>
      )}

      {error && (
        <div className="border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400 tracking-wide mb-4 font-mono">
          ✕ FEED ERROR — displaying last known state
        </div>
      )}

      {/* ── Category sections ────────────────────────────────────────────── */}
      <div className="space-y-4">
        {grouped.map((section) => (
          <CategorySection
            key={section.key}
            label={section.label}
            description={section.description}
            accent={section.accent}
            protocols={section.protocols}
          />
        ))}

        {uncategorized.length > 0 && (
          <CategorySection
            label="Other"
            description="Protocols not yet classified"
            accent="orange"
            protocols={uncategorized}
          />
        )}
      </div>
    </div>
  );
}
