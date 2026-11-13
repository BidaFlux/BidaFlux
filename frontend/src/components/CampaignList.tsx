"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { escrowAbi } from "@/abi";
import { CANONICAL_CHAIN } from "@/lib/chains";
import { readCampaign, type Campaign } from "@/lib/campaign";
import { deployment } from "@/lib/config";
import { fmtDuration, fmtToken, shortAddr } from "@/lib/format";
import { getEventLogs } from "@/lib/logs";
import { priceAt } from "@/lib/price";

export default function CampaignList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["campaigns", deployment.escrow],
    refetchInterval: 15_000,
    queryFn: async (): Promise<Campaign[]> => {
      const logs = await getEventLogs({
        chainId: CANONICAL_CHAIN.id,
        address: deployment.escrow!,
        abi: escrowAbi,
        eventName: "CampaignCreated",
      });
      const ids = logs.map((l) => l.args.campaignId as `0x${string}`).reverse();
      return Promise.all(ids.map(readCampaign));
    },
  });

  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const t = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 1000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) return <p className="small">Loading campaigns from Base Sepolia…</p>;
  if (error) return <p className="err">Could not load campaigns: {(error as Error).message}</p>;
  if (!data?.length) return <p className="small">No campaigns yet. Create one on the Sell page.</p>;

  return (
    <div className="grid">
      {data.map((c) => {
        const remaining = Number(c.expiry - now);
        return (
          <Link key={c.id} href={`/campaign/${c.id}`} className="card" style={{ color: "inherit" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>NFT #{c.tokenId.toString()}</strong>
              <span className="pill">{c.state}</span>
            </div>
            <div className="big">{fmtToken(priceAt(c, now))}</div>
            <p className="small">
              Reserve {fmtToken(c.reservePrice)} · seller {shortAddr(c.seller)}
              <br />
              {c.state === "Active" ? (remaining > 0 ? `${fmtDuration(remaining)} left` : "Expired, awaiting final intents or reclaim") : "Ended"}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
