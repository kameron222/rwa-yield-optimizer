import { Badge } from "@/components/ui/badge";
import type { RiskTier } from "@/lib/schema";

interface RiskBadgeProps {
  tier: RiskTier;
}

const config: Record<RiskTier, { label: string; className: string }> = {
  low: {
    label: "Low",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20",
  },
  medium: {
    label: "Medium",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20",
  },
  high: {
    label: "High",
    className: "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20",
  },
};

export function RiskBadge({ tier }: RiskBadgeProps) {
  const { label, className } = config[tier];
  return (
    <Badge variant="outline" className={`text-xs font-medium ${className}`}>
      {label}
    </Badge>
  );
}
