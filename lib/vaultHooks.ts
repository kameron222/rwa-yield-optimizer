"use client";

import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import { useState, useCallback } from "react";
import {
  VAULT_ADDRESS,
  USDC_ADDRESS,
  IS_DEPLOYED,
  RWAVAULT_ABI,
  ERC20_ABI,
  ISTRATEGY_ABI,
  STRATEGY_COLORS,
} from "./contracts";

const USDC_DECIMALS = 6;

// ── Vault-wide data ───────────────────────────────────────────────────────────

export function useVaultData() {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { address: VAULT_ADDRESS, abi: RWAVAULT_ABI, functionName: "totalAssets" },
      { address: VAULT_ADDRESS, abi: RWAVAULT_ABI, functionName: "totalSupply" },
      { address: VAULT_ADDRESS, abi: RWAVAULT_ABI, functionName: "depositCap" },
      { address: VAULT_ADDRESS, abi: RWAVAULT_ABI, functionName: "highWaterMark" },
      { address: VAULT_ADDRESS, abi: RWAVAULT_ABI, functionName: "PERFORMANCE_FEE" },
      { address: VAULT_ADDRESS, abi: RWAVAULT_ABI, functionName: "strategyDetails" },
    ],
    query: { enabled: IS_DEPLOYED, refetchInterval: 15_000 },
  });

  const [totalAssets, totalSupply, depositCap, , perfFee, stratDetails] =
    data?.map((r) => r.result) ?? [];

  const strategies = stratDetails
    ? (stratDetails as [string[], bigint[], bigint[]]).map((_) => _)
    : null;

  const [addrs, allocations, stratAssets] = strategies ?? [[], [], []];

  const totalAssetsNum = totalAssets
    ? Number(formatUnits(totalAssets as bigint, USDC_DECIMALS))
    : 0;

  const depositCapNum = depositCap
    ? Number(formatUnits(depositCap as bigint, USDC_DECIMALS))
    : 0;

  const perfFeePct = perfFee ? Number(perfFee as bigint) / 100 : 10;

  return {
    totalAssets: totalAssetsNum,
    totalSupply: totalSupply as bigint | undefined,
    depositCap: depositCapNum,
    perfFeePct,
    strategyAddrs: addrs as readonly `0x${string}`[],
    strategyAllocations: allocations as readonly bigint[],
    strategyAssets: stratAssets as readonly bigint[],
    isLoading,
    refetch,
  };
}

// ── Per-strategy enriched data ────────────────────────────────────────────────

export interface StrategyRow {
  address: `0x${string}`;
  name: string;
  allocationBps: number;
  allocationPct: number;
  assets: number;
  estimatedApyBps: number;
  color: string;
}

export function useStrategyRows(
  addrs: readonly `0x${string}`[],
  allocations: readonly bigint[],
  assets: readonly bigint[]
): StrategyRow[] {
  const nameContracts = addrs.map((addr) => ({
    address: addr,
    abi: ISTRATEGY_ABI,
    functionName: "name" as const,
  }));
  const apyContracts = addrs.map((addr) => ({
    address: addr,
    abi: ISTRATEGY_ABI,
    functionName: "estimatedAPY" as const,
  }));

  const { data: nameData } = useReadContracts({
    contracts: nameContracts,
    query: { enabled: addrs.length > 0 },
  });
  const { data: apyData } = useReadContracts({
    contracts: apyContracts,
    query: { enabled: addrs.length > 0 },
  });

  return addrs.map((addr, i) => {
    const allBps = Number(allocations[i] ?? BigInt(0));
    const assetVal = Number(formatUnits(assets[i] ?? BigInt(0), USDC_DECIMALS));
    const apyBps = Number((apyData?.[i]?.result as bigint | undefined) ?? BigInt(0));
    const name =
      (nameData?.[i]?.result as string | undefined) ??
      `Strategy ${i + 1}`;

    return {
      address: addr,
      name,
      allocationBps: allBps,
      allocationPct: allBps / 100,
      assets: assetVal,
      estimatedApyBps: apyBps,
      color: STRATEGY_COLORS[i] ?? "#6b7280",
    };
  });
}

// ── User position ─────────────────────────────────────────────────────────────

export function useUserPosition() {
  const { address } = useAccount();

  const { data: shares } = useReadContract({
    address: VAULT_ADDRESS,
    abi: RWAVAULT_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: IS_DEPLOYED && !!address, refetchInterval: 15_000 },
  });

  const { data: positionAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: RWAVAULT_ABI,
    functionName: "convertToAssets",
    args: [shares ?? BigInt(0)],
    query: { enabled: IS_DEPLOYED && !!shares && shares > BigInt(0) },
  });

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address as `0x${string}`, VAULT_ADDRESS],
    query: { enabled: IS_DEPLOYED && !!address, refetchInterval: 15_000 },
  });

  return {
    shares: shares as bigint | undefined,
    positionUSDC: positionAssets
      ? Number(formatUnits(positionAssets as bigint, USDC_DECIMALS))
      : 0,
    usdcBalance: usdcBalance
      ? Number(formatUnits(usdcBalance as bigint, USDC_DECIMALS))
      : 0,
    allowance: allowance as bigint | undefined,
  };
}

// ── Deposit flow (approve → deposit) ─────────────────────────────────────────

export type TxStatus = "idle" | "approving" | "depositing" | "withdrawing" | "success" | "error";

export function useVaultActions(onSuccess?: () => void) {
  const { address } = useAccount();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();

  const { isLoading: isMining } = useWaitForTransactionReceipt({
    hash: pendingHash,
    query: {
      enabled: !!pendingHash,
    },
  });

  const deposit = useCallback(
    async (amountUSDC: string, allowance: bigint | undefined) => {
      if (!address) return;
      try {
        setErrorMsg("");
        const raw = parseUnits(amountUSDC, USDC_DECIMALS);

        // Step 1: Approve if needed
        if (!allowance || allowance < raw) {
          setStatus("approving");
          const approveTx = await writeContractAsync({
            address: USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [VAULT_ADDRESS, maxUint256],
          });
          setPendingHash(approveTx);
          // Poll until mined
          await waitForReceipt(approveTx);
          setPendingHash(undefined);
        }

        // Step 2: Deposit
        setStatus("depositing");
        const depositTx = await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: RWAVAULT_ABI,
          functionName: "deposit",
          args: [raw, address],
        });
        setPendingHash(depositTx);
        await waitForReceipt(depositTx);
        setPendingHash(undefined);

        setStatus("success");
        onSuccess?.();
      } catch (e: unknown) {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "Transaction failed");
      }
    },
    [address, writeContractAsync, onSuccess]
  );

  const withdraw = useCallback(
    async (amountUSDC: string) => {
      if (!address) return;
      try {
        setErrorMsg("");
        setStatus("withdrawing");
        const raw = parseUnits(amountUSDC, USDC_DECIMALS);
        const tx = await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: RWAVAULT_ABI,
          functionName: "withdraw",
          args: [raw, address, address],
        });
        setPendingHash(tx);
        await waitForReceipt(tx);
        setPendingHash(undefined);
        setStatus("success");
        onSuccess?.();
      } catch (e: unknown) {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "Transaction failed");
      }
    },
    [address, writeContractAsync, onSuccess]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setErrorMsg("");
    setPendingHash(undefined);
  }, []);

  return { status, errorMsg, isMining, pendingHash, deposit, withdraw, reset };
}

// Simple poll until a tx is confirmed (avoids wagmi hook inside callbacks)
async function waitForReceipt(hash: `0x${string}`, maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 2_000));
    try {
      const { createPublicClient, http } = await import("viem");
      const { base } = await import("wagmi/chains");
      const client = createPublicClient({ chain: base, transport: http() });
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt?.status === "success") return receipt;
      if (receipt?.status === "reverted") throw new Error("Transaction reverted");
    } catch {
      // keep polling
    }
  }
  throw new Error("Transaction confirmation timed out");
}

// ── APY chart data generator (seeded mock for pre-deployment) ─────────────────

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function generateApyHistory(days: number): { date: string; apy: number }[] {
  const rand = lcg(days * 31337);
  const result: { date: string; apy: number }[] = [];
  let apy = 5.5;
  const now = Date.now();

  for (let i = days; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const delta = (rand() - 0.5) * 0.4 + (5.5 - apy) * 0.15;
    apy = Math.max(3, Math.min(9, apy + delta));
    const label =
      days <= 30
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    result.push({ date: label, apy: parseFloat(apy.toFixed(2)) });
  }
  return result;
}
