import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "RWA Yield Vault",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "3b4d8bf7c1e2f4a5b6c7d8e9f0a1b2c3",
  chains: [base],
  ssr: true,
});
