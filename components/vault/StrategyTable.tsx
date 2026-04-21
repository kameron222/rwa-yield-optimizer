"use client";

import { useVaultData, useStrategyRows } from "@/lib/vaultHooks";
import { IS_DEPLOYED } from "@/lib/contracts";

const MOCK_ROWS = [
  { name: "Aave V3 USDC Strategy",     allocationPct: 35, assets: 0, estimatedApyBps: 420, color: "#10b981", address: "—" },
  { name: "Compound V3 USDC Strategy", allocationPct: 35, assets: 0, estimatedApyBps: 580, color: "#0ea5e9", address: "—" },
  { name: "Morpho USDC Strategy",      allocationPct: 20, assets: 0, estimatedApyBps: 710, color: "#7c3aed", address: "—" },
  { name: "Ondo USDY Strategy (Stub)", allocationPct: 10, assets: 0, estimatedApyBps: 355, color: "#f59e0b", address: "—" },
];

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n === 0 ? "—" : `$${n.toFixed(0)}`;
}

function ApyBar({ bps }: { bps: number }) {
  const pct = Math.min((bps / 1000) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-emerald-400 font-mono text-xs w-12">{(bps / 100).toFixed(2)}%</span>
      <div className="h-1 flex-1 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AllocationBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white font-mono text-xs w-8">{pct.toFixed(0)}%</span>
      <div className="h-1 flex-1 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-gray-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StrategyTable() {
  const { strategyAddrs, strategyAllocations, strategyAssets, isLoading } = useVaultData();
  const liveRows = useStrategyRows(strategyAddrs, strategyAllocations, strategyAssets);

  const rows = IS_DEPLOYED && liveRows.length > 0 ? liveRows : MOCK_ROWS;
  const isMock = !IS_DEPLOYED || liveRows.length === 0;

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
        <span className="text-xs tracking-widest uppercase text-gray-400 font-mono">
          Strategy Breakdown
        </span>
        {isMock && (
          <span className="text-xs font-mono text-gray-500">Expected post-deployment</span>
        )}
        {IS_DEPLOYED && isLoading && (
          <span className="text-xs font-mono text-gray-400 animate-pulse">Loading...</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              {["Strategy", "Allocation", "Assets", "Est. APY", "Address"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-2.5 text-left text-xs tracking-widest uppercase text-gray-500 font-mono font-normal"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-gray-700 last:border-0 hover:bg-gray-750 transition-colors"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="text-sm font-mono text-white">{row.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3 min-w-[120px]">
                  <AllocationBar pct={row.allocationPct} />
                </td>
                <td className="px-5 py-3">
                  <span className="text-sm font-mono text-gray-300">{fmt(row.assets)}</span>
                </td>
                <td className="px-5 py-3 min-w-[140px]">
                  <ApyBar bps={row.estimatedApyBps} />
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs font-mono text-gray-500">
                    {"address" in row && typeof row.address === "string" && row.address !== "—"
                      ? `${(row.address as string).slice(0, 6)}…${(row.address as string).slice(-4)}`
                      : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
