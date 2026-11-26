"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuctionData } from "@/lib/auctionData";
import type { Campaign } from "@/lib/campaign";
import { buyerChains, chainById } from "@/lib/chains";
import { fmtToken, shortAddr } from "@/lib/format";
import { oldestPendingAge, pendingOf } from "@/lib/intents";
import { priceAt } from "@/lib/price";
import { auctionStatus, FILTERS, matchesFilter, pendingLabel, type AuctionStatus, type Filter } from "@/lib/status";
import { useNow } from "@/lib/useNow";
import { ChainChips } from "./ChainChip";
import Countdown from "./Countdown";
import NftArt from "./NftArt";
import Price from "./Price";
import { Empty, ErrorState, Loading } from "./States";
import StatusBadge from "./StatusBadge";

interface Row {
  c: Campaign;
  status: AuctionStatus;
  chains: number[];
  pending: number;
  pendingAge?: number;
}

export default function AuctionList() {
  const { data, isLoading, error, refetch } = useAuctionData();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("all");
  const [sort, setSort] = useState<"new" | "expiry">("new");

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return data.campaigns.flatMap((c) => {
      const mine = data.intentsByCampaign.get(c.id);
      const pending = pendingOf(mine).length;
      const status = auctionStatus({ state: c.state, expiry: c.expiry, now, pendingIntents: pending });
      if (!status) return [];
      return [{ c, status, chains: data.enabledChains.get(c.id) ?? [], pending, pendingAge: oldestPendingAge(mine, now) }];
    });
  }, [data, now]);

  if (isLoading) return <Loading label="Loading auctions from Base Sepolia…" />;
  if (error) return <ErrorState title="Could not load auctions" message={(error as Error).message} onRetry={() => refetch()} />;
  if (!data) return null;

  const count = (s: AuctionStatus) => rows.filter((r) => r.status === s).length;
  const volume = rows.filter((r) => r.status === "sold").reduce((sum, r) => sum + r.c.price, 0n);

  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => matchesFilter(r.status, filter))
    .filter((r) => network === "all" || r.chains.includes(Number(network)))
    .filter((r) => !q || [`nft #${r.c.tokenId}`, r.c.tokenId.toString(), r.c.id, r.c.seller].some((s) => s.toLowerCase().includes(q)))
    .sort(sort === "new" ? () => 0 : (a, b) => Number(a.c.expiry - b.c.expiry));

  return (
    <>
      <div className="stats">
        <div className="card stat">
          <b>{count("active")}</b>
          <span>Active auctions</span>
        </div>
        <div className="card stat">
          <b>{fmtToken(volume)} bUSD</b>
          <span>Settled volume</span>
        </div>
        <div className="card stat">
          <b>{buyerChains.length}</b>
          <span>Networks</span>
        </div>
      </div>

      <div className="filters">
        <input className="search" type="search" placeholder="Search NFT #, campaign ID or seller" aria-label="Search auctions" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="row" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button key={f} className="pill" aria-pressed={f === filter} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <select aria-label="Network" value={network} onChange={(e) => setNetwork(e.target.value)}>
          <option value="all">All networks</option>
          {buyerChains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "new" | "expiry")}>
          <option value="new">Newest first</option>
          <option value="expiry">Expiry time</option>
        </select>
      </div>

      {!rows.length ? (
        <Empty title="No auctions yet">
          <p className="small">
            Nothing has been created on this escrow. <Link href="/sell">Create one on the Sell page.</Link>
          </p>
        </Empty>
      ) : !shown.length ? (
        <Empty title="No auctions match these filters" />
      ) : (
        <div className="cards">{shown.map((r) => <AuctionCard key={r.c.id} row={r} now={now} />)}</div>
      )}
    </>
  );
}

function AuctionCard({ row: { c, status, chains, pending, pendingAge }, now }: { row: Row; now: bigint }) {
  const sold = status === "sold";
  const price = sold ? c.price : priceAt(c, now);
  return (
    <article className="card">
      <NftArt nft={c.nft} tokenId={c.tokenId}>
        <StatusBadge status={status} />
      </NftArt>
      <Price value={price} />
      <div className="small">
        {sold ? "Final price" : `Reserve ${fmtToken(c.reservePrice)} bUSD`}
        {(status === "active" || status === "processing") && (
          <>
            {" "}· <Countdown expiry={c.expiry} />
          </>
        )}
        {c.state === "Reclaimed" && " · NFT reclaimed by seller"}
        {status === "expired" && c.state !== "Reclaimed" && " · ended unsold"}
      </div>
      {sold && (
        <div className="strip strip-sold">
          <b>Sold to {shortAddr(c.winner)}</b>
          <br />
          <span className="small">on {chainById(Number(c.winnerChainId))?.name ?? `chain ${c.winnerChainId}`}</span>
        </div>
      )}
      {status === "processing" && (
        <div className="strip strip-processing">
          <b>
            {pending} intent{pending > 1 ? "s" : ""} processing
          </b>
          <br />
          <span className="small">{pendingLabel(pendingAge ?? 0)}</span>
        </div>
      )}
      <div className="row between">
        <ChainChips chainIds={chains} />
        <Link className="btn ghost" href={`/campaign/${c.id}`}>
          View details
        </Link>
      </div>
    </article>
  );
}
