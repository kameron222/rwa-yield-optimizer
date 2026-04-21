import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-6">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ?? "text-white"}`}>
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}
