"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RiskBadge } from "./RiskBadge";
import { ChainBadge } from "./ChainBadge";
import type { Protocol, RiskTier } from "@/lib/schema";

type SortKey = "apy" | "tvl" | "lockupDays" | "name";
type SortDir = "asc" | "desc";

function formatTvl(tvl: number): string {
  if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(2)}B`;
  if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(1)}M`;
  if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(0)}K`;
  return `$${tvl}`;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-zinc-700">↕</span>;
  return <span className="ml-1 text-zinc-300">{dir === "asc" ? "↑" : "↓"}</span>;
}

interface Props {
  protocols: Protocol[];
}

export function ProtocolTable({ protocols }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("tvl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterChain, setFilterChain] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const chains = useMemo(
    () => ["all", ...Array.from(new Set(protocols.map((p) => p.chain))).sort()],
    [protocols]
  );

  // Group raw categories into 5 display buckets
  const CATEGORY_GROUPS: Record<string, string> = {
    "Tokenized T-Bills": "Treasury",
    "Tokenized Money Market": "Treasury",
    "Money Market Fund": "Treasury",
    "Yield-Bearing Stablecoin": "Treasury",
    "Tokenized Bonds": "Treasury",
    "Basis Trading": "Treasury",
    "Credit": "Credit",
    "Lending": "Credit",
    "RWA Pools": "Credit",
    "Commodity": "Commodity",
    "Real Estate": "Real Estate",
  };

  const sorted = useMemo(() => {
    let filtered = protocols;
    if (filterChain !== "all") filtered = filtered.filter((p) => p.chain === filterChain);
    if (filterRisk !== "all") filtered = filtered.filter((p) => p.riskTier === filterRisk);
    if (filterCategory !== "all") {
      filtered = filtered.filter(
        (p) => (CATEGORY_GROUPS[p.category ?? ""] ?? p.category) === filterCategory
      );
    }

    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocols, sortKey, sortDir, filterChain, filterRisk, filterCategory]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const thClass =
    "cursor-pointer select-none text-zinc-400 hover:text-white transition-colors font-medium text-xs uppercase tracking-wider";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Chain</span>
          <Select value={filterChain} onValueChange={(v) => v && setFilterChain(v)}>
            <SelectTrigger className="h-8 w-36 bg-zinc-900 border-zinc-800 text-sm text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              {chains.map((c) => (
                <SelectItem key={c} value={c} className="text-sm capitalize">
                  {c === "all" ? "All Chains" : c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Category</span>
          <Select value={filterCategory} onValueChange={(v) => v && setFilterCategory(v)}>
            <SelectTrigger className="h-8 w-40 bg-zinc-900 border-zinc-800 text-sm text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              {["all", "Treasury", "Credit", "Real Estate", "Commodity"].map((c) => (
                <SelectItem key={c} value={c} className="text-sm">
                  {c === "all" ? "All Categories" : c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Risk</span>
          <Select value={filterRisk} onValueChange={(v) => v && setFilterRisk(v)}>
            <SelectTrigger className="h-8 w-36 bg-zinc-900 border-zinc-800 text-sm text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              {["all", "low", "medium", "high"].map((r) => (
                <SelectItem key={r} value={r} className="text-sm capitalize">
                  {r === "all" ? "All Risk Tiers" : r.charAt(0).toUpperCase() + r.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-zinc-600 ml-auto">
          {sorted.length} protocol{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className={thClass} onClick={() => toggleSort("name")}>
                Protocol <SortIcon active={sortKey === "name"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider font-medium">
                Category
              </TableHead>
              <TableHead className={thClass} onClick={() => toggleSort("apy")}>
                APY <SortIcon active={sortKey === "apy"} dir={sortDir} />
              </TableHead>
              <TableHead className={thClass} onClick={() => toggleSort("tvl")}>
                TVL <SortIcon active={sortKey === "tvl"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider font-medium">
                Chain
              </TableHead>
              <TableHead className={thClass} onClick={() => toggleSort("lockupDays")}>
                Lockup <SortIcon active={sortKey === "lockupDays"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider font-medium">
                Risk
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider font-medium">
                Contract
              </TableHead>
              <TableHead className="text-zinc-400 text-xs uppercase tracking-wider font-medium">
                {/* Deposit */}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p, i) => (
              <TableRow
                key={p.id}
                className={`border-zinc-800 hover:bg-zinc-800/50 transition-colors ${
                  i % 2 === 0 ? "bg-zinc-900/30" : ""
                }`}
              >
                <TableCell className="font-medium text-white">{p.name}</TableCell>
                <TableCell className="text-zinc-400 text-sm">{p.category ?? "—"}</TableCell>
                <TableCell>
                  <span
                    className={`font-semibold tabular-nums ${
                      p.apy >= 10
                        ? "text-amber-400"
                        : p.apy >= 5
                        ? "text-emerald-400"
                        : "text-zinc-300"
                    }`}
                  >
                    {p.apy > 0 ? `${p.apy.toFixed(2)}%` : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-white font-mono text-sm tabular-nums">
                  {formatTvl(p.tvl)}
                </TableCell>
                <TableCell>
                  <ChainBadge chain={p.chain} />
                </TableCell>
                <TableCell className="text-zinc-300 text-sm tabular-nums">
                  {p.lockupDays === 0 ? (
                    <span className="text-emerald-400">Flexible</span>
                  ) : (
                    `${p.lockupDays}d`
                  )}
                </TableCell>
                <TableCell>
                  <RiskBadge tier={p.riskTier as RiskTier} />
                </TableCell>
                <TableCell>
                  {p.contractAddress ? (
                    <span className="font-mono text-xs text-zinc-500">
                      {p.contractAddress.slice(0, 6)}…{p.contractAddress.slice(-4)}
                    </span>
                  ) : (
                    <span className="text-zinc-700 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {p.depositUrl ? (
                    <a
                      href={p.depositUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-md border border-emerald-600/50 bg-transparent px-3 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:border-emerald-500 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                    >
                      Deposit ↗
                    </a>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-zinc-500 py-12">
                  No protocols match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
