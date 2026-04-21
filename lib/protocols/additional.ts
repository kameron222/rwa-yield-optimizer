// All remaining RWA protocols — live TVL from DeFiLlama protocols API + researched APY.
// APY sources: protocol docs, DeFiLlama yields where project slug differs from protocol slug,
// or on-chain rate at time of last research (2026-04). Mark static APY with comment.
//
// DeFiLlama slugs verified against https://api.llama.fi/protocols

import type { Protocol } from "@/lib/schema";
import { getProtocolTvl } from "./llamaYields";

interface ProtocolDef {
  id: string;
  name: string;
  slug: string; // DeFiLlama protocol slug; empty string = no DeFiLlama entry (use fallback)
  apy: number;
  fallbackTvl: number;
  chain: string;
  lockupDays: number;
  riskTier: Protocol["riskTier"];
  contractAddress?: string;
  category: string;
}

const PROTOCOL_DEFS: ProtocolDef[] = [
  // ── Tokenized Treasuries & Money Markets ───────────────────────────────
  {
    id: "blackrock-buidl",
    name: "BlackRock BUIDL",
    slug: "blackrock-buidl",
    apy: 5.0, // SOFR-linked, ~5% static
    fallbackTvl: 3_035_208_002,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0x7712c34205737192402172409a8F7ccef8aA2AEc",
    category: "Tokenized Money Market",
  },
  {
    id: "franklin-templeton-benji",
    name: "Franklin Templeton BENJI",
    slug: "", // Not tracked on DeFiLlama under a resolvable slug
    apy: 5.1, // FOBXX fund yield, ~5.1% static
    fallbackTvl: 940_000_000,
    chain: "Stellar",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: undefined,
    category: "Money Market Fund",
  },
  {
    id: "superstate-ustb",
    name: "Superstate USTB",
    slug: "superstate-ustb",
    apy: 5.22, // Disclosed weekly on superstate.co
    fallbackTvl: 741_831_444,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0x43415eB6ff9DB7E26A15b704e7A3eDCe97d31C4e",
    category: "Tokenized T-Bills",
  },
  {
    id: "superstate-uscc",
    name: "Superstate USCC",
    slug: "superstate-uscc",
    apy: 5.0, // Basis trading, approximate
    fallbackTvl: 263_602_911,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "medium",
    contractAddress: undefined,
    category: "Basis Trading",
  },
  {
    id: "openeden-tbill",
    name: "OpenEden TBILL",
    slug: "openeden-tbill",
    apy: 5.0, // T-bill backed, ~5%
    fallbackTvl: 135_438_432,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a",
    category: "Tokenized T-Bills",
  },
  {
    id: "openeden-usdo",
    name: "OpenEden USDO",
    slug: "openeden-usdo",
    apy: 4.5, // RWA-backed stablecoin yield
    fallbackTvl: 40_718_907,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: undefined,
    category: "Yield-Bearing Stablecoin",
  },
  {
    id: "matrixdock-stbt",
    name: "Matrixdock STBT",
    slug: "matrixdock-stbt",
    apy: 5.0, // T-bill backed, ~5%
    fallbackTvl: 104_209_587,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0x530824DA86689C9C17a601884B3a8839D84B5bdA",
    category: "Tokenized T-Bills",
  },
  {
    id: "backedfi-bib01",
    name: "Backed bIB01",
    slug: "backedfi",
    apy: 4.0, // iBoxx $ Liquid Investment Grade tracker
    fallbackTvl: 8_170_414,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0xCA30c93B02514f86d5C86a6e375E3A330B435Fb5",
    category: "Tokenized Bonds",
  },
  {
    id: "hashnote-usyc",
    name: "Hashnote USYC",
    slug: "", // Not yet on DeFiLlama — using Hashnote public attestation data
    apy: 5.05, // SOFR-linked short-duration T-bill fund
    fallbackTvl: 800_000_000,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0x136471a34f6ef19fE571EFFC1CA711fdb8E49f2b",
    category: "Tokenized T-Bills",
  },
  {
    id: "mountain-protocol-usdm",
    name: "Mountain Protocol USDM",
    slug: "mountain-protocol",
    apy: 4.5, // Passes through T-bill yield to holders
    fallbackTvl: 1_395_297,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C",
    category: "Yield-Bearing Stablecoin",
  },

  // ── Basis Trading ──────────────────────────────────────────────────────
  {
    id: "ethena-usde",
    name: "Ethena USDe",
    slug: "ethena-usde",
    apy: 0, // USDe itself earns 0%; yield accrues to sUSDe stakers
    fallbackTvl: 5_832_343_748,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "medium",
    contractAddress: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
    category: "Basis Trading",
  },
  {
    id: "ethena-usdtb",
    name: "Ethena USDtb",
    slug: "ethena-usdtb",
    apy: 5.0, // T-bill backed sub-product of Ethena
    fallbackTvl: 869_404_941,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: undefined,
    category: "Tokenized T-Bills",
  },

  // ── Commodities ────────────────────────────────────────────────────────
  {
    id: "tether-gold-xaut",
    name: "Tether Gold (XAUT)",
    slug: "tether-gold",
    apy: 0, // Physical gold — no yield
    fallbackTvl: 3_432_969_755,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
    category: "Commodity",
  },
  {
    id: "paxos-gold-paxg",
    name: "Paxos Gold (PAXG)",
    slug: "paxos-gold",
    apy: 0, // Physical gold — no yield
    fallbackTvl: 2_376_569_047,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: "0x45804880De22913dAFE09f4980848ECE6EcbAf78",
    category: "Commodity",
  },
  {
    id: "matrixdock-xaum",
    name: "Matrixdock XAUM",
    slug: "matrixdock-xaum",
    apy: 0, // Tokenized gold — no yield
    fallbackTvl: 76_053_206,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: undefined,
    category: "Commodity",
  },

  // ── Tokenized Real Estate ──────────────────────────────────────────────
  {
    id: "realt-tokens",
    name: "RealT",
    slug: "realt-tokens",
    apy: 7.5, // Rental yield distributed weekly, ~6-9% historically
    fallbackTvl: 156_807_243,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "medium",
    contractAddress: undefined,
    category: "Real Estate",
  },
  {
    id: "tangible-rwa",
    name: "Tangible",
    slug: "tangible-rwa",
    apy: 6.0, // UK real estate rental yield average
    fallbackTvl: 42_345_138,
    chain: "Polygon",
    lockupDays: 0,
    riskTier: "high",
    contractAddress: undefined,
    category: "Real Estate",
  },
  {
    id: "parcl",
    name: "Parcl",
    slug: "parcl-v3",
    apy: 0, // Derivatives on real estate price indices — no fixed yield
    fallbackTvl: 4_432_908,
    chain: "Solana",
    lockupDays: 0,
    riskTier: "high",
    contractAddress: undefined,
    category: "Real Estate",
  },
  {
    id: "landshare",
    name: "Landshare",
    slug: "landshare",
    apy: 8.0, // US real estate rental yield
    fallbackTvl: 621_293,
    chain: "BSC",
    lockupDays: 0,
    riskTier: "high",
    contractAddress: undefined,
    category: "Real Estate",
  },

  // ── Additional Ondo products ────────────────────────────────────────────
  {
    id: "ondo-global-markets",
    name: "Ondo Global Markets",
    slug: "ondo-global-markets",
    apy: 3.47, // Same underlying as OUSG (short-term USG bonds)
    fallbackTvl: 820_127_421,
    chain: "Ethereum",
    lockupDays: 0,
    riskTier: "low",
    contractAddress: undefined,
    category: "Tokenized T-Bills",
  },
];

export async function getAdditionalProtocols(): Promise<Protocol[]> {
  const results = await Promise.allSettled(
    PROTOCOL_DEFS.map(async (def) => {
      const liveTvl = def.slug ? await getProtocolTvl(def.slug) : null;
      return {
        id: def.id,
        name: def.name,
        apy: def.apy,
        tvl: liveTvl ?? def.fallbackTvl,
        chain: def.chain,
        lockupDays: def.lockupDays,
        riskTier: def.riskTier,
        contractAddress: def.contractAddress,
        lastUpdated: new Date().toISOString(),
        category: def.category,
      } satisfies Protocol;
    })
  );

  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<Protocol>).value);
}
