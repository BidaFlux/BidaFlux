"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import type { TransactionReceipt } from "viem";
import { errMessage } from "@/lib/format";
import TxLink from "./TxLink";

type WriteArgs = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

interface Props {
  chainId: number;
  label: string;
  /** Builds the contract call at click time, so it can use fresh values. */
  request: () => WriteArgs | Promise<WriteArgs>;
  disabled?: boolean;
  onDone?: (receipt: TransactionReceipt) => void;
}

/** Switches to `chainId` if needed, sends one transaction, and waits for its receipt. */
export default function TxButton({ chainId, label, request, disabled, onDone }: Props) {
  const { isConnected, chainId: current } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId });
  const [status, setStatus] = useState<"idle" | "wallet" | "pending" | "done" | "error">("idle");
  const [hash, setHash] = useState<string>();
  const [error, setError] = useState<string>();

  async function run() {
    setError(undefined);
    try {
      if (current !== chainId) await switchChainAsync({ chainId });
      setStatus("wallet");
      const h = await writeContractAsync(await request());
      setHash(h);
      setStatus("pending");
      const receipt = await client!.waitForTransactionReceipt({ hash: h });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      setStatus("done");
      onDone?.(receipt);
    } catch (e) {
      setError(errMessage(e));
      setStatus("error");
    }
  }

  const busy = status === "wallet" || status === "pending";
  return (
    <div className="tx">
      <button className="btn" disabled={disabled || !isConnected || busy} onClick={run}>
        {status === "wallet" ? "Confirm in wallet…" : status === "pending" ? "Waiting for block…" : label}
      </button>
      {hash && (
        <span className="small">
          {status === "done" ? "Confirmed " : "Sent "}
          <TxLink chainId={chainId} hash={hash} />
        </span>
      )}
      {error && <span className="small err">{error}</span>}
    </div>
  );
}
