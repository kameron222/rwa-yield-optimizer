"use client";

import { useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { useUserPosition, useVaultActions, type TxStatus } from "@/lib/vaultHooks";
import { IS_DEPLOYED } from "@/lib/contracts";
import { WalletButton } from "./WalletButton";

type Tab = "deposit" | "withdraw";

const STATUS_LABEL: Record<TxStatus, string> = {
  idle: "",
  approving: "Approving USDC...",
  depositing: "Depositing...",
  withdrawing: "Withdrawing...",
  success: "Transaction confirmed",
  error: "Transaction failed",
};

function StepIndicator({ step, label, done }: { step: number; label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono font-bold border ${
          done
            ? "bg-emerald-500 border-emerald-500 text-black"
            : "border-gray-600 text-gray-500"
        }`}
      >
        {done ? "✓" : step}
      </div>
      <span className={`text-xs font-mono ${done ? "text-emerald-400" : "text-gray-500"}`}>
        {label}
      </span>
    </div>
  );
}

export function DepositWithdrawForm() {
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const { usdcBalance, positionUSDC, allowance } = useUserPosition();
  const { status, errorMsg, deposit, withdraw, reset } = useVaultActions(() => {
    setAmount("");
  });

  const isWrongChain = isConnected && chainId !== base.id;
  const isBusy = status === "approving" || status === "depositing" || status === "withdrawing";

  const maxDeposit = usdcBalance.toFixed(2);
  const maxWithdraw = positionUSDC.toFixed(2);

  const amountNum = parseFloat(amount) || 0;
  const needsApprove =
    tab === "deposit" && (!allowance || allowance < BigInt(Math.floor(amountNum * 1e6)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || amountNum <= 0) return;
    reset();
    if (tab === "deposit") {
      await deposit(amount, allowance);
    } else {
      await withdraw(amount);
    }
  }

  function setMax() {
    setAmount(tab === "deposit" ? maxDeposit : maxWithdraw);
  }

  const depositInsufficient = tab === "deposit" && amountNum > usdcBalance;
  const withdrawInsufficient = tab === "withdraw" && amountNum > positionUSDC;
  const isInvalid = depositInsufficient || withdrawInsufficient || amountNum <= 0;

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-800 flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {(["deposit", "withdraw"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setAmount(""); reset(); }}
            className={`flex-1 py-3 text-xs tracking-widest uppercase font-mono transition-colors ${
              tab === t
                ? "text-emerald-400 border-b-2 border-emerald-500 bg-emerald-950/30"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-5 flex flex-col gap-5">
        {/* Wallet gate */}
        {!isConnected ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-gray-400 font-mono text-center">
              Connect your wallet to deposit or withdraw
            </p>
            <WalletButton />
          </div>
        ) : isWrongChain ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-gray-400 font-mono text-center">
              Switch to Base to interact with the vault
            </p>
            <button
              onClick={() => switchChain({ chainId: base.id })}
              className="px-4 py-2 text-xs font-mono bg-emerald-500 text-black rounded hover:bg-emerald-400 transition-colors"
            >
              Switch to Base
            </button>
          </div>
        ) : !IS_DEPLOYED ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-400 font-mono">Vault contract not yet deployed</p>
            <p className="text-xs text-gray-600 font-mono mt-1">
              Set NEXT_PUBLIC_VAULT_ADDRESS after deployment
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Amount input */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-xs tracking-widest uppercase text-gray-400 font-mono">
                  Amount (USDC)
                </label>
                <button
                  type="button"
                  onClick={setMax}
                  className="text-xs font-mono text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  MAX: {tab === "deposit" ? maxDeposit : maxWithdraw}
                </button>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); reset(); }}
                  placeholder="0.00"
                  disabled={isBusy}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-4 py-3 text-lg font-mono text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 disabled:opacity-40 transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-mono">
                  USDC
                </span>
              </div>
              {depositInsufficient && (
                <p className="text-xs text-red-400 font-mono">Insufficient USDC balance</p>
              )}
              {withdrawInsufficient && (
                <p className="text-xs text-red-400 font-mono">Insufficient vault position</p>
              )}
            </div>

            {/* Approve step indicator (deposit only) */}
            {tab === "deposit" && amountNum > 0 && (
              <div className="flex flex-col gap-2 p-3 bg-gray-900 rounded border border-gray-700">
                <StepIndicator
                  step={1}
                  label="Approve USDC"
                  done={!needsApprove || status === "depositing" || status === "success"}
                />
                <StepIndicator
                  step={2}
                  label="Deposit to vault"
                  done={status === "success"}
                />
              </div>
            )}

            {/* Balance info */}
            <div className="flex justify-between text-xs font-mono text-gray-500">
              <span>Wallet: {usdcBalance.toFixed(2)} USDC</span>
              <span>Position: {positionUSDC.toFixed(2)} USDC</span>
            </div>

            {/* Status */}
            {status !== "idle" && (
              <div
                className={`text-xs font-mono px-3 py-2 rounded ${
                  status === "success"
                    ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                    : status === "error"
                    ? "text-red-400 bg-red-500/10 border border-red-500/20"
                    : "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                }`}
              >
                {status === "error" ? errorMsg : STATUS_LABEL[status]}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isBusy || isInvalid || !amount}
              className={`w-full py-3 text-sm font-mono tracking-widest uppercase rounded transition-all ${
                tab === "deposit"
                  ? "bg-emerald-500 hover:bg-emerald-400 text-black disabled:bg-emerald-900 disabled:text-emerald-700"
                  : "bg-gray-600 hover:bg-gray-500 text-white disabled:bg-gray-700 disabled:text-gray-500"
              } disabled:cursor-not-allowed`}
            >
              {isBusy
                ? STATUS_LABEL[status]
                : needsApprove && tab === "deposit"
                ? "Approve & Deposit"
                : tab === "deposit"
                ? "Deposit USDC"
                : "Withdraw USDC"}
            </button>

            {tab === "deposit" && amountNum > 0 && (
              <p className="text-xs text-gray-600 font-mono text-center">
                You receive rwUSDC shares redeemable 1:1 + yield
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
