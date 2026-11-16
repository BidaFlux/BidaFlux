"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { vaultAbi } from "@/abi";
import { chainById } from "@/lib/chains";
import { deployment } from "@/lib/config";
import { fmtToken } from "@/lib/format";
import { getEventLogs, publicClientFor } from "@/lib/logs";
import TxButton from "./TxButton";
import TxLink from "./TxLink";

const STATUS = ["None", "Locked", "Paid", "Unlocked"] as const;

interface Row {
  chainId: number;
  intentId: `0x${string}`;
  txHash: `0x${string}`;
  amount: bigint;
  status: (typeof STATUS)[number];
  finalized: boolean;
  isWinner: boolean;
}

/** The connected buyer's intents for one campaign, across both vaults, with their on-chain status. */
export default function MyIntents({ campaignId }: { campaignId: `0x${string}` }) {
  const { address } = useAccount();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["my-intents", campaignId, address],
    enabled: Boolean(address),
    refetchInterval: 5_000,
    queryFn: async (): Promise<Row[]> => {
      const rows: Row[] = [];
      for (const chainId of Object.keys(deployment.vault).map(Number)) {
        const vault = deployment.vault[chainId];
        if (!vault) continue;
        const logs = await getEventLogs({ chainId, address: vault, abi: vaultAbi, eventName: "IntentSubmitted", args: { campaignId, buyer: address } });
        const client = publicClientFor(chainId);
        for (const l of logs) {
          const intentId = l.args.intentId as `0x${string}`;
          const [intent, finalized, winnerIntent] = await Promise.all([
            client.readContract({ address: vault, abi: vaultAbi, functionName: "intents", args: [intentId] }),
            client.readContract({ address: vault, abi: vaultAbi, functionName: "finalized", args: [campaignId] }),
            client.readContract({ address: vault, abi: vaultAbi, functionName: "winnerIntentOf", args: [campaignId] }),
          ]);
          rows.push({
            chainId,
            intentId,
            txHash: l.txHash,
            amount: intent[2],
            status: STATUS[Number(intent[4])] ?? "None",
            finalized,
            isWinner: winnerIntent === intentId,
          });
        }
      }
      return rows;
    },
  });

  if (!address || data.length === 0) return null;
  return (
    <div className="card">
      <h2>Your intents</h2>
      <table>
        <thead>
          <tr>
            <th>Chain</th>
            <th>Locked</th>
            <th>Status</th>
            <th>Tx</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.intentId}>
              <td>{chainById(r.chainId)?.name}</td>
              <td>{fmtToken(r.amount)}</td>
              <td>
                {r.status}
                {r.status === "Locked" && !r.finalized && <span className="small"> · waiting for Reactive</span>}
                {r.status === "Locked" && r.isWinner && <span className="small"> · won, payout pending</span>}
                {r.status === "Paid" && <span className="ok"> · won</span>}
              </td>
              <td>
                <TxLink chainId={r.chainId} hash={r.txHash} />
              </td>
              <td>
                {r.status === "Locked" && r.finalized && !r.isWinner && (
                  <TxButton
                    chainId={r.chainId}
                    label="Unlock"
                    request={() => ({ address: deployment.vault[r.chainId]!, abi: vaultAbi, functionName: "unlock", args: [r.intentId], chainId: r.chainId })}
                    onDone={() => qc.invalidateQueries({ queryKey: ["my-intents"] })}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
