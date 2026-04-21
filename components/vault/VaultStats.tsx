"use client";

import { useVaultData, useUserPosition, useStrategyRows } from "@/lib/vaultHooks";
import { useAccount } from "wagmi";
import { IS_DEPLOYED } from "@/lib/contracts";

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function Skeleton() {
  return <div className="h-7 w-24 bg-gray-700 rounded animate-pulse" />;
}

interface StatProps {
  label: string;
  value: string | null;
  sub?: string;
  accent?: boolean;
}

function Stat({ label, value, sub, accent }: StatProps) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-xs tracking-widest uppercase text-gray-400 font-mono">{label}</span>
      {value === null ? (
        <Skeleton />
      ) : (
        <span
          className={`text-2xl font-mono font-semibold tabular-nums ${
            accent ? "text-emerald-400" : "text-white"
          }`}
        >
          {value}
        </span>
      )}
      {sub && <span className="text-xs text-gray-500 font-mono">{sub}</span>}
    </div>
  );
}

export function VaultStats() {
  const { address } = useAccount();
  const {
    totalAssets,
    depositCap,
    perfFeePct,
    strategyAddrs,
    strategyAllocations,
    strategyAssets,
    isLoading,
  } = useVaultData();

  const { positionUSDC } = useUserPosition();
  const rows = useStrategyRows(strategyAddrs, strategyAllocations, strategyAssets);

  const blendedApy =
    rows.length > 0
      ? rows.reduce((sum, r) => sum + (r.estimatedApyBps / 10_000) * r.allocationPct, 0) * 100
      : null;

  const displayApy =
    blendedApy !== null && blendedApy > 0
      ? `${blendedApy.toFixed(2)}%`
      : IS_DEPLOYED && isLoading
      ? null
      : "—";

  const utilisation =
    depositCap > 0 ? ((totalAssets / depositCap) * 100).toFixed(1) : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-gray-700 rounded-lg bg-gray-800 divide-x divide-y md:divide-y-0 divide-gray-700">
      <Stat
        label="Total Deposits"
        value={IS_DEPLOYED ? (isLoading ? null : fmt(totalAssets)) : "—"}
        sub={
          depositCap > 0
            ? `Cap: ${fmt(depositCap)} · ${utilisation}% full`
            : IS_DEPLOYED
            ? "No cap set"
            : "Contract not deployed"
        }
      />
      <Stat
        label="Your Position"
        value={address ? fmt(positionUSDC) : "—"}
        sub={address ? "rwUSDC shares" : "Connect wallet"}
        accent={positionUSDC > 0}
      />
      <Stat
        label="Blended APY"
        value={displayApy}
        sub={
          rows.length > 0
            ? `${rows.length} active strategies`
            : "Weighted across strategies"
        }
        accent
      />
      <Stat
        label="Performance Fee"
        value={`${perfFeePct}%`}
        sub="On yield only (high-water mark)"
      />
    </div>
  );
}
