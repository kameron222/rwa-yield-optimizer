const CHAIN_COLORS: Record<string, string> = {
  Ethereum:  "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  Solana:    "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Stellar:   "bg-sky-500/10 text-sky-400 border-sky-500/20",
  Polygon:   "bg-violet-500/10 text-violet-400 border-violet-500/20",
  Avalanche: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  BSC:       "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  Mantle:    "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Sui:       "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Aptos:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
  XRPL:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Noble:     "bg-zinc-400/10 text-zinc-300 border-zinc-400/20",
};

export function ChainBadge({ chain }: { chain: string }) {
  const cls = CHAIN_COLORS[chain] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {chain}
    </span>
  );
}
