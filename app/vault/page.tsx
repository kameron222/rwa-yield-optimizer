import dynamic from "next/dynamic";
import Link from "next/link";

const WalletButton = dynamic(
  () => import("@/components/vault/WalletButton").then((m) => m.WalletButton),
  { ssr: false, loading: () => <div className="w-32 h-8 bg-gray-700 rounded animate-pulse" /> }
);

const VaultStats = dynamic(
  () => import("@/components/vault/VaultStats").then((m) => m.VaultStats),
  { ssr: false, loading: () => <StatsSkeleton /> }
);

const DepositWithdrawForm = dynamic(
  () => import("@/components/vault/DepositWithdrawForm").then((m) => m.DepositWithdrawForm),
  { ssr: false, loading: () => <CardSkeleton className="h-72" /> }
);

const AllocationDonut = dynamic(
  () => import("@/components/vault/AllocationDonut").then((m) => m.AllocationDonut),
  { ssr: false, loading: () => <CardSkeleton className="h-72" /> }
);

const StrategyTable = dynamic(
  () => import("@/components/vault/StrategyTable").then((m) => m.StrategyTable),
  { ssr: false, loading: () => <CardSkeleton className="h-48" /> }
);

const HistoricalAPYChart = dynamic(
  () => import("@/components/vault/HistoricalAPYChart").then((m) => m.HistoricalAPYChart),
  { ssr: false, loading: () => <CardSkeleton className="h-80" /> }
);

function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`border border-gray-700 rounded-lg bg-gray-800 flex items-center justify-center ${className}`}
    >
      <div className="w-5 h-5 rounded-full border-2 border-gray-600 border-t-emerald-500 animate-spin" />
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-gray-700 rounded-lg bg-gray-800 divide-x divide-y md:divide-y-0 divide-gray-700">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex flex-col gap-2 px-5 py-4">
          <div className="h-3 w-20 bg-gray-700 rounded animate-pulse" />
          <div className="h-7 w-24 bg-gray-700 rounded animate-pulse" />
          <div className="h-2.5 w-32 bg-gray-700 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function VaultPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Top bar */}
      <div className="border-b border-gray-700 bg-gray-900/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors tracking-widest uppercase"
            >
              ← Dashboard
            </Link>
            <div className="h-4 w-px bg-gray-700" />
            <span className="text-xs font-mono text-gray-400 tracking-widest uppercase">
              Yield Vault
            </span>
          </div>
          <WalletButton />
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-mono font-semibold tracking-tight">RWA YIELD VAULT</h1>
            <span className="text-xs font-mono text-gray-500">ERC-4626 · Base Network · USDC</span>
          </div>
          <p className="text-sm font-mono text-gray-500">
            Institutional-grade yield optimizer allocating across Aave V3, Compound V3, MetaMorpho,
            and Ondo Finance
          </p>
        </div>

        <VaultStats />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DepositWithdrawForm />
          <AllocationDonut />
        </div>

        <StrategyTable />

        <HistoricalAPYChart />

        <div className="flex items-center justify-between pt-2 border-t border-gray-700">
          <p className="text-xs font-mono text-gray-600">
            Smart contracts audited · Non-custodial · Deployed on Base mainnet
          </p>
          <div className="flex gap-4 text-xs font-mono text-gray-600">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 transition-colors"
            >
              Contracts
            </a>
            <a
              href="https://basescan.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 transition-colors"
            >
              Explorer
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
