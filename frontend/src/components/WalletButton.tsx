"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { chainById } from "@/lib/chains";
import { shortAddr } from "@/lib/format";

export default function WalletButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (!isConnected || !address) {
    return (
      <button className="btn" disabled={isPending || connectors.length === 0} onClick={() => connect({ connector: connectors[0] })}>
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  return (
    <div className="row">
      <span className="pill">{chainById(chainId ?? 0)?.name ?? `Chain ${chainId}`}</span>
      <span className="mono">{shortAddr(address)}</span>
      <button className="btn ghost" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
