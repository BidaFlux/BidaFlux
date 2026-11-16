"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import BuyerPanel from "@/components/BuyerPanel";
import CampaignActions from "@/components/CampaignActions";
import NotDeployed from "@/components/NotDeployed";
import SellerPanel from "@/components/SellerPanel";
import { readCampaign } from "@/lib/campaign";
import { addressUrl, CANONICAL_CHAIN, chainById } from "@/lib/chains";
import { deployment, isDeployed } from "@/lib/config";
import { fmtDuration, fmtTime, fmtToken, shortAddr } from "@/lib/format";
import { priceAt } from "@/lib/price";

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const campaignId = id as `0x${string}`;
  const { address } = useAccount();
  const { data: c, isLoading, error } = useQuery({
    queryKey: ["campaign", campaignId],
    enabled: isDeployed,
    refetchInterval: 5_000,
    queryFn: () => readCampaign(campaignId),
  });
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const t = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 1000);
    return () => clearInterval(t);
  }, []);

  if (!isDeployed) return <NotDeployed />;
  if (isLoading) return <p className="small">Loading campaign…</p>;
  if (error) return <p className="err">Could not load campaign: {(error as Error).message}</p>;
  if (!c || c.state === "None") return <p>Campaign not found on {CANONICAL_CHAIN.name}.</p>;

  const remaining = Number(c.expiry - now);
  return (
    <>
      <h1>NFT #{c.tokenId.toString()}</h1>
      <p className="small mono">{c.id}</p>
      <div className="grid">
        <div className="card">
          <span className="pill">{c.state}</span>
          <div className="big">{fmtToken(c.state === "Settled" ? c.price : priceAt(c, now))} bUSD</div>
          <p className="small">
            {c.state === "Settled" ? "Final price paid" : "Current Dutch price (local clock; the escrow decides on-chain)"}
            <br />
            Reserve {fmtToken(c.reservePrice)} · drops {fmtToken(c.decrement)} every {c.interval.toString()}s
          </p>
          {c.state === "Active" && <p>{remaining > 0 ? `${fmtDuration(remaining)} left` : "Expired. Late intents already submitted may still settle."}</p>}
        </div>
        <div className="card">
          <h2>Details</h2>
          <p className="small">
            Seller {shortAddr(c.seller)}
            <br />
            Custody: {CANONICAL_CHAIN.name} escrow{" "}
            <a className="mono" href={addressUrl(CANONICAL_CHAIN.id, deployment.escrow!)} target="_blank" rel="noreferrer">
              {shortAddr(deployment.escrow!)} ↗
            </a>
            <br />
            Started {fmtTime(c.start)}
            <br />
            Ends {fmtTime(c.expiry)}
          </p>
          {c.state === "Settled" && (
            <p className="ok">
              Won by {shortAddr(c.winner)} bidding from {chainById(Number(c.winnerChainId))?.name}.
            </p>
          )}
        </div>
      </div>
      {address?.toLowerCase() === c.seller.toLowerCase() ? (
        <>
          <SellerPanel campaign={c} now={now} />
          <CampaignActions campaign={c} now={now} />
        </>
      ) : (
        <>
          <CampaignActions campaign={c} now={now} />
          <BuyerPanel campaign={c} now={now} />
        </>
      )}
    </>
  );
}
