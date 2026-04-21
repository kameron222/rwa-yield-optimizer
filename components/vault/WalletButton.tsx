"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletButton() {
  return (
    <ConnectButton
      chainStatus="icon"
      showBalance={false}
      accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
    />
  );
}
