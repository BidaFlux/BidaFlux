"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { buildActivity, REJECT_REASONS, type ActivityRow, type Step } from "@/lib/activity";
import { useAuctionData, type FeedEvent } from "@/lib/auctionData";
import { addressUrl, CANONICAL_CHAIN, chainById, lasna } from "@/lib/chains";
import { deployment } from "@/lib/config";
import { fmtTime, fmtToken, shortAddr } from "@/lib/format";
import { fmtLatency, summarize } from "@/lib/latency";
import { blockTimestamp } from "@/lib/logs";
import { loadReactiveTxs } from "@/lib/reactiveTxs";
import { pendingLabel } from "@/lib/status";
import { useNow } from "@/lib/useNow";
import { Empty, ErrorState, Loading } from "./States";
import TxLink from "./TxLink";

const FILTERS = ["All", "Processing", "Won", "Rejected"] as const;
type Filter = (typeof FILTERS)[number];
const kindOf = (r: ActivityRow): Filter => (!r.intent.decision ? "Processing" : r.intent.decision.kind === "settled" ? "Won" : "Rejected");

function StepCell({ step, label }: { step?: Step; label: string }) {
  return (
    <>
      <div>{label}</div>
      {step && (
        <>
          <TxLink chainId={step.chainId} hash={step.txHash} />
          <div className="small">
            {chainById(step.chainId)?.name} · {fmtTime(step.ts)}
          </div>
        </>
      )}
    </>
  );
}

const FEED_LABEL: Record<FeedEvent["kind"], string> = {
  created: "Auction created",
  reclaimed: "NFT reclaimed",
  deposited: "bUSD deposited",
  withdrawn: "bUSD withdrawn",
};

/** Auction creations, reclaims and vault deposits/withdrawals: every transaction that is not an intent. */
function Feed({ events }: { events: FeedEvent[] }) {
  const times = useQuery({
    queryKey: ["feed-times", events.length],
    queryFn: async () => {
      const m: Record<string, bigint> = {};
      await Promise.all(events.map(async (e) => (m[e.txHash] = e.ts ?? (await blockTimestamp(e.chainId, e.blockNumber)))));
      return m;
    },
  });
  if (!events.length) return null;
  return (
    <div className="card scroll">
      <h2>Auctions and vault activity</h2>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Details</th>
            <th>Chain</th>
            <th>When</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={`${e.txHash}:${e.kind}:${e.blockNumber}`}>
              <td>{FEED_LABEL[e.kind]}</td>
              <td className="small">
                {e.kind === "created" && e.campaignId && (
                  <>
                    NFT #{e.tokenId?.toString()} by {shortAddr(e.account ?? "")} · <Link href={`/campaign/${e.campaignId}`}>view auction →</Link>
                  </>
                )}
                {e.kind === "reclaimed" && e.campaignId && <Link href={`/campaign/${e.campaignId}`}>view auction →</Link>}
                {(e.kind === "deposited" || e.kind === "withdrawn") && `${fmtToken(e.amount ?? 0n)} bUSD · ${shortAddr(e.account ?? "")}`}
              </td>
              <td>{chainById(e.chainId)?.name}</td>
              <td className="small">{times.data?.[e.txHash] !== undefined ? fmtTime(times.data[e.txHash]) : "…"}</td>
              <td>
                <TxLink chainId={e.chainId} hash={e.txHash} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ActivityMonitor() {
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("All");
  const shared = useAuctionData();
  const reactive = useQuery({ queryKey: ["reactive-txs", deployment.coordinator], queryFn: loadReactiveTxs, refetchInterval: 10_000 });
  const d = shared.data;
  const rows = useQuery({
    queryKey: ["activity-rows", d?.intents.length, d?.intents.filter((i) => i.decision).length, d?.intents.filter((i) => i.vault).length, reactive.data?.length],
    enabled: Boolean(d),
    queryFn: () => buildActivity(d!, reactive.data ?? []),
  });

  if (shared.isLoading || (d && rows.isLoading)) return <Loading label="Reading events from Base Sepolia, Unichain Sepolia and Lasna…" />;
  if (shared.error) return <ErrorState title="Could not load activity" message={(shared.error as Error).message} onRetry={() => shared.refetch()} />;
  if (rows.error) return <ErrorState title="Could not read block times" message={(rows.error as Error).message} onRetry={() => rows.refetch()} />;
  const all = rows.data ?? [];
  if (!all.length)
    return (
      <>
        <Empty title="No purchase intents yet">
          <p className="small">Intents and their Reactive hops appear here as soon as a buyer submits one. Other transactions are listed below.</p>
        </Empty>
        <Feed events={d?.feed ?? []} />
      </>
    );

  const shown = all.filter((r) => filter === "All" || kindOf(r) === filter);
  const hop1 = summarize(all.map((r) => r.hop1));
  const hop2 = summarize(all.map((r) => r.hop2));
  const lasnaTxs = reactive.data?.length;

  return (
    <>
      <div className="stats">
        <div className="card stat">
          <b>{fmtLatency(hop1)}</b>
          <span>Hop 1: intent to escrow decision</span>
        </div>
        <div className="card stat">
          <b>{fmtLatency(hop2)}</b>
          <span>Hop 2: decision to vault outcome</span>
        </div>
        <div className="card stat">
          <b>{all.length}</b>
          <span>Intents</span>
        </div>
        <div className="card stat">
          <b>{reactive.isError ? "Unavailable" : lasnaTxs ?? "…"}</b>
          <span>Lasna callback transactions found</span>
        </div>
      </div>
      <p className="small">
        Latency is the whole-second difference between block timestamps on the chains involved; each hop includes a Reactive
        transaction on Lasna, so it is not a measure of the Reactive step alone.
        {deployment.coordinator && (
          <>
            {" "}Coordinator:{" "}
            <a className="mono" href={addressUrl(lasna.id, deployment.coordinator)} target="_blank" rel="noreferrer">
              {shortAddr(deployment.coordinator)} ↗
            </a>
          </>
        )}
      </p>

      <div className="filters" role="group" aria-label="Filter intents">
        {FILTERS.map((f) => (
          <button key={f} className="pill" aria-pressed={f === filter} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th>Intent</th>
              <th>1. Submitted</th>
              <th>2. Escrow decision ({CANONICAL_CHAIN.name})</th>
              <th>3. Vault outcome</th>
              <th>Reactive (Lasna)</th>
              <th>Hops</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const i = r.intent;
              const decisionLabel = !i.decision
                ? `Processing · ${pendingLabel(Number(now - i.intentTs))}`
                : i.decision.kind === "settled"
                  ? `Won at ${fmtToken(i.decision.price ?? 0n)} bUSD`
                  : `Rejected: ${REJECT_REASONS[i.decision.reason ?? 0] ?? "unknown reason"}`;
              return (
                <tr key={i.intentId}>
                  <td>
                    <span className="mono">{shortAddr(i.intentId)}</span>
                    <div className="small">
                      {shortAddr(i.buyer)} · lock {fmtToken(i.lockAmount)} bUSD
                    </div>
                    <Link href={`/campaign/${i.campaignId}`} className="small">
                      campaign →
                    </Link>
                  </td>
                  <td>
                    <StepCell step={r.source} label="Intent" />
                  </td>
                  <td>
                    <StepCell step={r.decision} label={decisionLabel} />
                  </td>
                  <td>
                    <StepCell step={r.vault} label={i.vault ? (i.vault.kind === "paid" ? "Seller paid" : "Funds unlocked") : "Pending"} />
                  </td>
                  <td className="small">
                    {[
                      ["hop 1", r.reactive.hop1],
                      ["hop 2", r.reactive.hop2],
                    ].map(([name, link]) => (
                      <div key={name as string}>
                        {name as string}: {link ? <TxLink chainId={lasna.id} hash={(link as { txHash: string }).txHash} /> : "Not found"}
                      </div>
                    ))}
                  </td>
                  <td className="small">
                    <div>hop 1: {r.hop1 !== undefined ? `${r.hop1}s` : "not measured"}</div>
                    <div>hop 2: {r.hop2 !== undefined ? `${r.hop2}s` : "not measured"}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <p className="small">No {filter.toLowerCase()} intents.</p>}
      </div>

      <Feed events={d?.feed ?? []} />
    </>
  );
}
