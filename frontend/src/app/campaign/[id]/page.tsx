"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ChainChip, ChainChips } from "@/components/ChainChip";
import BuyerPanel from "@/components/BuyerPanel";
import CampaignActions from "@/components/CampaignActions";
import Countdown from "@/components/Countdown";
import IntentsTable from "@/components/IntentsTable";
import MyIntents from "@/components/MyIntents";
import NftArt from "@/components/NftArt";
import NotDeployed from "@/components/NotDeployed";
import Price from "@/components/Price";
import PriceCurve from "@/components/PriceCurve";
import SellerPanel from "@/components/SellerPanel";
import SettlementPanel from "@/components/SettlementPanel";
import { Empty, ErrorState, Loading } from "@/components/States";
import StatusBadge from "@/components/StatusBadge";
import { useAuctionData } from "@/lib/auctionData";
import { readCampaign } from "@/lib/campaign";
import { addressUrl, CANONICAL_CHAIN } from "@/lib/chains";
import { deployment, isDeployed } from "@/lib/config";
import { fmtTime, fmtToken, shortAddr } from "@/lib/format";
import { oldestPendingAge, pendingOf } from "@/lib/intents";
import { priceAt } from "@/lib/price";
import { auctionStatus, pendingLabel } from "@/lib/status";
import { useNow } from "@/lib/useNow";

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const campaignId = id as `0x${string}`;
  const { address } = useAccount();
  const now = useNow();
  const { data: c, isLoading, error, refetch } = useQuery({
    queryKey: ["campaign", campaignId],
    enabled: isDeployed,
    refetchInterval: 5_000,
    queryFn: () => readCampaign(campaignId),
  });
  const shared = useAuctionData();

  if (!isDeployed) return <NotDeployed />;
  if (isLoading) return <Loading label="Loading campaign…" />;
  if (error) return <ErrorState title="Could not load campaign" message={(error as Error).message} onRetry={() => refetch()} />;
  if (!c || c.state === "None") return <Empty title="Campaign not found">{`No campaign with this ID on ${CANONICAL_CHAIN.name}.`}</Empty>;

  const intents = shared.data?.intentsByCampaign.get(c.id) ?? [];
  const pending = pendingOf(intents);
  const status = auctionStatus({ state: c.state, expiry: c.expiry, now, pendingIntents: pending.length })!;
  const chains = shared.data?.enabledChains.get(c.id) ?? [];
  const sold = status === "sold";
  const isSeller = address?.toLowerCase() === c.seller.toLowerCase();
  const duration = Number(c.expiry - c.start);
  const age = oldestPendingAge(intents, now);

  return (
    <>
      <p className="crumbs">
        <Link href="/">← Auctions</Link> / NFT #{c.tokenId.toString()}
      </p>
      <div className="row between">
        <h1>NFT #{c.tokenId.toString()}</h1>
        <StatusBadge status={status} />
      </div>
      <p className="small mono">{c.id}</p>
      {shared.error && <div className="warnbox">Intent activity could not be loaded, so Processing cannot be shown. {(shared.error as Error).message}</div>}

      <div className="detail">
        <NftArt nft={c.nft} tokenId={c.tokenId} />
        <div className="card" style={{ margin: 0 }}>
          <span className="small">{sold ? "Final price" : "Current Dutch price"}</span>
          <div>
            <Price value={sold ? c.price : priceAt(c, now)} className="price" />
          </div>
          <div className="small">
            {sold ? "Settled" : status === "expired" ? "Ended" : <Countdown expiry={c.expiry} />}
            {!sold && status !== "expired" && " · local clock; the escrow decides on-chain"}
          </div>
          <div className="triple">
            <div><b>{fmtToken(c.startPrice)}</b><span className="small">Start</span></div>
            <div><b>{fmtToken(c.reservePrice)}</b><span className="small">Reserve</span></div>
            <div><b>{fmtToken(c.decrement)} / {c.interval.toString()}s</b><span className="small">Decrement</span></div>
          </div>
          <PriceCurve curve={c} duration={duration} now={now} showNow={status === "active" || status === "processing"} />
        </div>
      </div>

      <div className="detail" style={{ marginTop: 16 }}>
        <div>
          <div className="card">
            <h2>Purchase activity</h2>
            {status === "processing" && (
              <div className="strip strip-processing">
                <b>{pending.length} intent{pending.length > 1 ? "s" : ""} processing</b>
                <br />
                <span className="small">{pendingLabel(age ?? 0)}</span>
              </div>
            )}
            <IntentsTable intents={intents} now={now} />
          </div>
          <div className="card">
            <h2>Auction details</h2>
            <dl className="kv">
              <dt>Seller</dt>
              <dd className="mono">{shortAddr(c.seller)}</dd>
              <dt>NFT contract</dt>
              <dd className="mono">{shortAddr(c.nft)}</dd>
              <dt>Token ID</dt>
              <dd>{c.tokenId.toString()}</dd>
              <dt>Custody escrow</dt>
              <dd>
                {CANONICAL_CHAIN.name}{" "}
                <a className="mono" href={addressUrl(CANONICAL_CHAIN.id, deployment.escrow!)} target="_blank" rel="noreferrer">
                  {shortAddr(deployment.escrow!)} ↗
                </a>
              </dd>
              <dt>Eligible networks</dt>
              <dd>{chains.length ? <ChainChips chainIds={chains} /> : <span className="small">Unavailable</span>}</dd>
              {sold && (
                <>
                  <dt>Winning chain</dt>
                  <dd><ChainChip chainId={Number(c.winnerChainId)} /></dd>
                </>
              )}
              <dt>Starts</dt>
              <dd>{fmtTime(c.start)}</dd>
              <dt>Expires</dt>
              <dd>{fmtTime(c.expiry)}</dd>
            </dl>
          </div>
        </div>

        <div>
          {sold && <div className="card"><SettlementPanel campaign={c} intents={intents} /></div>}
          {isSeller ? (
            <>
              <SellerPanel campaign={c} now={now} />
              <CampaignActions campaign={c} now={now} />
            </>
          ) : sold || c.state === "Reclaimed" ? (
            <>
              <CampaignActions campaign={c} now={now} />
              <MyIntents campaignId={c.id} />
              {!sold && <div className="card"><p className="small">This campaign is closed: the seller reclaimed the NFT.</p></div>}
            </>
          ) : (
            <>
              <CampaignActions campaign={c} now={now} />
              <BuyerPanel campaign={c} now={now} processing={status === "processing" ? pending.length : 0} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
