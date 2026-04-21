export type RiskTier = "low" | "medium" | "high";

export interface Protocol {
  id: string;
  name: string;
  apy: number; // percentage, e.g. 5.5 = 5.5%
  tvl: number; // USD value
  chain: string;
  lockupDays: number; // 0 = no lockup
  riskTier: RiskTier;
  contractAddress?: string;
  lastUpdated: string; // ISO 8601
  logoUrl?: string;
  category?: string;
  depositUrl?: string;
}

export interface AggregatedResponse {
  protocols: Protocol[];
  fetchedAt: string;
  errors: Record<string, string>;
}
