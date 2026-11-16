"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { addressUrl, CANONICAL_CHAIN, chainById, lasna } from "@/lib/chains";
import { loadActivity, REJECT_REASONS, type IntentRow, type Step } from "@/lib/activity";
import { deployment } from "@/lib/config";
import { fmtTime, fmtToken, shortAddr } from "@/lib/format";
import TxLink from "./TxLink";

function StepCell({ step, label }: { step?: Step; label?: string }) {
  if (!step) return <span className="small">pending</span>;
  return (
    <>
      <div>{label}</div>
      <TxLink chainId={step.chainId} hash={step.txHash} />
      <div className="small">
        {chainById(step.chainId)?.name} · {fmtTime(step.ts)}
      </div>
    </>
  );
}

function decisionLabel(r: IntentRow) {
  if (!r.decision) return undefined;
  if (r.decision.kind === "settled") return `Won at ${fmtToken(r.decision.price ?? 0n)}`;
  return `Rejected: ${REJECT_REASONS[r.decision.reason ?? 0] ?? "unknown"}`;
}

function vaultLabel(r: IntentRow) {
  if (!r.vault) return undefined;
  return r.vault.kind === "paid" ? "Seller paid" : "Funds unlocked";
}

export default function ActivityMonitor() {
  const { data, isLoading, error } = useQuery({ queryKey: ["activity", deployment.escrow], queryFn: loadActivity, refetchInterval: 10_000 });

  if (isLoading) return <p className="small">Reading events from Base Sepolia and Unichain Sepolia…</p>;
  if (error) return <p className="err">Could not load activity: {(error as Error).message}</p>;
  if (!data?.length) return <p className="small">No intents yet.</p>;

  const hop1 = data.flatMap((r) => (r.hop1 === undefined ? [] : [r.hop1]));
  const hop2 = data.flatMap((r) => (r.hop2 === undefined ? [] : [r.hop2]));

  return (
    <>
      <div className="card">
        <h2>Measured latency</h2>
        <p className="small">
          Differences between block timestamps (whole seconds), taken from the transactions below. Hop 1 is the buyer&apos;s intent to
          the escrow&apos;s decision; hop 2 is the escrow&apos;s settlement to the seller payout on the winner&apos;s chain. Each hop
          includes a Reactive transaction on Lasna.
        </p>
        <p>
          Hop 1: {hop1.length ? hop1.map((s) => `${s}s`).join(", ") : "not measured yet"}
          <br />
          Hop 2: {hop2.length ? hop2.map((s) => `${s}s`).join(", ") : "not measured yet"}
        </p>
        {deployment.coordinator && (
          <p className="small">
            Reactive transactions (Lasna):{" "}
            <a className="mono" href={addressUrl(lasna.id, deployment.coordinator)} target="_blank" rel="noreferrer">
              coordinator {shortAddr(deployment.coordinator)} ↗
            </a>
          </p>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h2>Intent lifecycle</h2>
        <table>
          <thead>
            <tr>
              <th>Intent</th>
              <th>1. Intent submitted</th>
              <th>2. Escrow decision ({CANONICAL_CHAIN.name})</th>
              <th>3. Vault outcome</th>
              <th>Hops</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.intentId}>
                <td>
                  <span className="mono">{shortAddr(r.intentId)}</span>
                  <div className="small">
                    {shortAddr(r.buyer)} · lock {fmtToken(r.lockAmount)}
                  </div>
                  <Link href={`/campaign/${r.campaignId}`} className="small">
                    campaign →
                  </Link>
                </td>
                <td>
                  <StepCell step={r.source} label="Intent" />
                </td>
                <td>
                  <StepCell step={r.decision} label={decisionLabel(r)} />
                </td>
                <td>
                  <StepCell step={r.vault} label={vaultLabel(r)} />
                </td>
                <td className="small">
                  {r.hop1 !== undefined && <div>hop 1: {r.hop1}s</div>}
                  {r.hop2 !== undefined && <div>hop 2: {r.hop2}s</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small">
          &quot;pending&quot; means no matching event has been found on-chain yet. Nothing here is estimated or filled in.
        </p>
      </div>
    </>
  );
}
