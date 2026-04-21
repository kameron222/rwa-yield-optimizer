"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useVaultData, useStrategyRows } from "@/lib/vaultHooks";
import { IS_DEPLOYED } from "@/lib/contracts";

const MOCK_STRATEGIES = [
  { name: "Aave V3 USDC", allocationPct: 35, assets: 0, color: "#10b981" },
  { name: "Compound V3 USDC", allocationPct: 35, assets: 0, color: "#0ea5e9" },
  { name: "Morpho USDC", allocationPct: 20, assets: 0, color: "#7c3aed" },
  { name: "Ondo USDY (Stub)", allocationPct: 10, assets: 0, color: "#f59e0b" },
];

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded px-3 py-2 font-mono text-xs shadow-xl">
      <p className="text-white font-medium mb-0.5">{d.name}</p>
      <p style={{ color: d.color }} className="font-bold">
        {d.allocationPct.toFixed(1)}%
      </p>
      {d.assets > 0 && <p className="text-gray-400">{fmt(d.assets)}</p>}
    </div>
  );
}

export function AllocationDonut() {
  const { strategyAddrs, strategyAllocations, strategyAssets, totalAssets } = useVaultData();
  const liveRows = useStrategyRows(strategyAddrs, strategyAllocations, strategyAssets);

  const rows =
    IS_DEPLOYED && liveRows.length > 0
      ? liveRows.map((r) => ({
          name: r.name,
          allocationPct: r.allocationPct,
          assets: r.assets,
          color: r.color,
        }))
      : MOCK_STRATEGIES.map((m) => ({ ...m, assets: 0 }));

  const totalPct = rows.reduce((s, r) => s + r.allocationPct, 0);

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-800 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-widest uppercase text-gray-400 font-mono">
          Strategy Allocation
        </span>
        {!IS_DEPLOYED && (
          <span className="text-xs font-mono text-gray-500 bg-gray-900 px-2 py-0.5 border border-gray-700 rounded">
            Expected post-deployment
          </span>
        )}
      </div>

      {/* Donut + legend */}
      <div className="flex items-center gap-4">
        <div className="h-44 w-44 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="85%"
                paddingAngle={2}
                dataKey="allocationPct"
                stroke="none"
              >
                {rows.map((r, i) => (
                  <Cell key={`cell-${i}`} fill={r.color} opacity={0.9} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2.5 flex-1 min-w-0">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <span className="text-xs font-mono text-gray-300 truncate">{r.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 font-mono text-xs">
                <span className="text-white">{r.allocationPct.toFixed(0)}%</span>
                {r.assets > 0 && <span className="text-gray-500">{fmt(r.assets)}</span>}
              </div>
            </div>
          ))}
          <div className="border-t border-gray-700 pt-2 flex justify-between font-mono text-xs">
            <span className="text-gray-400">Total</span>
            <span className="text-white">
              {totalAssets > 0 ? fmt(totalAssets) : `${totalPct.toFixed(0)}% allocated`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
