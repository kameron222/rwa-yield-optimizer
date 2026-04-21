"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { generateApyHistory } from "@/lib/vaultHooks";

const PERIODS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded px-3 py-2 font-mono text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      <p className="text-emerald-400 font-bold">{payload[0].value.toFixed(2)}% APY</p>
    </div>
  );
}

export function HistoricalAPYChart() {
  const [period, setPeriod] = useState(30);

  const data = useMemo(() => generateApyHistory(period), [period]);
  const values = data.map((d) => d.apy);
  const currentApy = values[values.length - 1];
  const startApy = values[0];
  const minApy = Math.min(...values);
  const maxApy = Math.max(...values);
  const trend = currentApy - startApy;

  const xInterval = period <= 7 ? 0 : period <= 30 ? 3 : period <= 90 ? 6 : 30;

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-800 p-5 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-xs tracking-widest uppercase text-gray-400 font-mono">
            Historical APY
          </span>
          <span className={`text-xs font-mono ${trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {trend >= 0 ? "+" : ""}
            {trend.toFixed(2)}% vs {PERIODS.find((p) => p.days === period)?.label}
          </span>
        </div>

        {/* Period selector */}
        <div className="flex gap-1">
          {PERIODS.map(({ label, days }) => (
            <button
              key={label}
              onClick={() => setPeriod(days)}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                period === days
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "text-gray-500 hover:text-gray-300 border border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Current APY display */}
      <div className="flex items-end gap-4">
        <div>
          <span className="text-3xl font-mono font-semibold text-emerald-400">
            {currentApy.toFixed(2)}%
          </span>
          <span className="text-xs text-gray-500 font-mono ml-2">current blended APY</span>
        </div>
        <div className="font-mono text-xs text-gray-500 pb-1">
          Range: {minApy.toFixed(2)}% — {maxApy.toFixed(2)}%
        </div>
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#6b7280", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              interval={xInterval}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 9, fill: "#6b7280", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={5.5} stroke="#4b5563" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="apy"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-600 font-mono">
        * Simulated data — live data from on-chain harvest events post-deployment
      </p>
    </div>
  );
}
