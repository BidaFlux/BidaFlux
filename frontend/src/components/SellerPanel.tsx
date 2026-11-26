import type { Campaign } from "@/lib/campaign";
import { chainById } from "@/lib/chains";
import { fmtDuration, fmtToken, shortAddr } from "@/lib/format";

/** What the seller sees instead of the buyer panel. */
export default function SellerPanel({ campaign, now }: { campaign: Campaign; now: bigint }) {
  const remaining = Number(campaign.expiry - now);
  return (
    <div className="card">
      <h2>Your Auction</h2>
      {campaign.state === "Active" && <p>{remaining > 0 ? `Waiting for buyers. Ends in ${fmtDuration(remaining)}.` : "Auction ended."}</p>}
      {campaign.state === "Settled" && (
        <p className="ok">
          Sold for {fmtToken(campaign.price)} bUSD to {shortAddr(campaign.winner)} on{" "}
          {chainById(Number(campaign.winnerChainId))?.name ?? `chain ${campaign.winnerChainId}`}.
        </p>
      )}
      {campaign.state === "Reclaimed" && <p>NFT reclaimed.</p>}
      <p className="small">Sellers can&apos;t bid on their own auction.</p>
    </div>
  );
}
