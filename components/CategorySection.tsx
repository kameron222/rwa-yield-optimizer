"use client";

import { useState } from "react";
import { RiskBadge } from "./RiskBadge";
import { ChainBadge } from "./ChainBadge";
import type { Protocol, RiskTier } from "@/lib/schema";

function fmt(tvl: number): string {
  if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(2)}B`;
  if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(1)}M`;
  if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(0)}K`;
  return `$${tvl.toFixed(0)}`;
}

type SortKey = "name" | "apy" | "tvl" | "lockupDays";
type SortDir = "asc" | "desc";

const ACCENT = {
  emerald: {
    bar:    "bg-emerald-500",
    text:   "text-emerald-400",
    badge:  "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    glow:   "shadow-emerald-500/5",
  },
  amber: {
    bar:    "bg-amber-500",
    text:   "text-amber-400",
    badge:  "text-amber-300 bg-amber-500/10 border-amber-500/20",
    glow:   "shadow-amber-500/5",
  },
  blue: {
    bar:    "bg-blue-500",
    text:   "text-blue-400",
    badge:  "text-blue-300 bg-blue-500/10 border-blue-500/20",
    glow:   "shadow-blue-500/5",
  },
  orange: {
    bar:    "bg-orange-500",
    text:   "text-orange-400",
    badge:  "text-orange-300 bg-orange-500/10 border-orange-500/20",
    glow:   "shadow-orange-500/5",
  },
  purple: {
    bar:    "bg-purple-500",
    text:   "text-purple-400",
    badge:  "text-purple-300 bg-purple-500/10 border-purple-500/20",
    glow:   "shadow-purple-500/5",
  },
} as const;

export type AccentColor = keyof typeof ACCENT;

interface Props {
  label: string;
  description: string;
  accent: AccentColor;
  protocols: Protocol[];
}

export function CategorySection({ label, description, accent, protocols }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("tvl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [collapsed, setCollapsed] = useState(false);

  const a = ACCENT[accent];

  const totalAum = protocols.reduce((s, p) => s + p.tvl, 0);
  const yieldingProtocols = protocols.filter((p) => p.apy > 0);
  const avgApy = yieldingProtocols.length
    ? yieldingProtocols.reduce((s, p) => s + p.apy, 0) / yieldingProtocols.length
    : 0;

  const sorted = [...protocols].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === "string" && typeof bv === "string"
      ? av.localeCompare(bv)
      : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortCaret({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-zinc-700 ml-0.5">↕</span>;
    return <span className={`ml-0.5 ${a.text}`}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const TH = ({ children, col, right }: { children: React.ReactNode; col?: SortKey; right?: boolean }) => (
    <th
      onClick={col ? () => toggleSort(col) : undefined}
      className={[
        "px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase border-b border-zinc-800/80 whitespace-nowrap",
        right ? "text-right" : "text-left",
        col ? "cursor-pointer select-none text-zinc-500 hover:text-zinc-300 transition-colors" : "text-zinc-600",
      ].join(" ")}
    >
      {children}{col && <SortCaret col={col} />}
    </th>
  );

  return (
    <div className={`rounded-none border border-zinc-800 bg-[#0a0a0a] overflow-hidden shadow-xl ${a.glow}`}>

      {/* ── Section header ── */}
      <div className="flex items-stretch">
        {/* Left accent bar */}
        <div className={`w-[3px] shrink-0 ${a.bar}`} />

        <div className="flex-1 flex items-center justify-between px-5 py-4 gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-zinc-100">
                {label}
              </span>
              <span className={`text-[10px] font-semibold tracking-widest px-2 py-0.5 rounded-sm border ${a.badge}`}>
                {protocols.length} {protocols.length === 1 ? "PROTOCOL" : "PROTOCOLS"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-600 tracking-wide">{description}</p>
          </div>

          {/* Section stats */}
          <div className="hidden sm:flex items-center gap-8 shrink-0">
            <div className="text-right">
              <div className="text-[10px] tracking-widest uppercase text-zinc-600 mb-0.5">Total AUM</div>
              <div className={`text-base font-bold tabular-nums font-mono ${a.text}`}>{fmt(totalAum)}</div>
            </div>
            {avgApy > 0 && (
              <div className="text-right">
                <div className="text-[10px] tracking-widest uppercase text-zinc-600 mb-0.5">Avg Yield</div>
                <div className="text-base font-bold tabular-nums font-mono text-zinc-200">{avgApy.toFixed(2)}%</div>
              </div>
            )}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="text-zinc-600 hover:text-zinc-300 transition-colors text-xs tracking-widest uppercase select-none"
            >
              {collapsed ? "▼ SHOW" : "▲ HIDE"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-zinc-900/60">
              <tr>
                <TH col="name">Protocol</TH>
                <TH col="apy" right>APY</TH>
                <TH col="tvl" right>AUM</TH>
                <TH>Chain</TH>
                <TH col="lockupDays">Lockup</TH>
                <TH>Risk</TH>
                <TH>Contract</TH>
                <TH><span /></TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {sorted.map((p) => (
                <tr key={p.id} className="group hover:bg-zinc-800/25 transition-colors duration-75">

                  {/* Protocol name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-1 h-4 rounded-full shrink-0 ${a.bar} opacity-40 group-hover:opacity-100 transition-opacity`} />
                      <div>
                        <div className="font-medium text-zinc-100 text-sm leading-tight">{p.name}</div>
                        <div className="text-[10px] text-zinc-600 tracking-wide mt-0.5">{p.category}</div>
                      </div>
                    </div>
                  </td>

                  {/* APY */}
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono font-semibold tabular-nums text-sm ${
                      p.apy === 0 ? "text-zinc-600" :
                      p.apy >= 10 ? "text-amber-400" :
                      p.apy >= 5  ? "text-emerald-400" : "text-zinc-300"
                    }`}>
                      {p.apy > 0 ? `${p.apy.toFixed(2)}%` : "—"}
                    </span>
                  </td>

                  {/* AUM */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm font-medium text-zinc-200 tabular-nums">
                      {fmt(p.tvl)}
                    </span>
                  </td>

                  {/* Chain */}
                  <td className="px-4 py-3">
                    <ChainBadge chain={p.chain} />
                  </td>

                  {/* Lockup */}
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs tabular-nums ${
                      p.lockupDays === 0 ? "text-emerald-500" : "text-zinc-400"
                    }`}>
                      {p.lockupDays === 0 ? "Flexible" : `${p.lockupDays}d`}
                    </span>
                  </td>

                  {/* Risk */}
                  <td className="px-4 py-3">
                    <RiskBadge tier={p.riskTier as RiskTier} />
                  </td>

                  {/* Contract */}
                  <td className="px-4 py-3">
                    {p.contractAddress ? (
                      <span className="font-mono text-[11px] text-zinc-600 tracking-tight">
                        {p.contractAddress.slice(0, 6)}…{p.contractAddress.slice(-4)}
                      </span>
                    ) : (
                      <span className="text-zinc-800 text-xs">—</span>
                    )}
                  </td>

                  {/* Deposit */}
                  <td className="px-4 py-3">
                    {p.depositUrl ? (
                      <a
                        href={p.depositUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 px-3 py-1 text-[10px] font-bold tracking-widest uppercase border rounded-sm transition-all
                          border-zinc-700 text-zinc-500 hover:${a.text} hover:border-current`}
                      >
                        ACCESS ↗
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
