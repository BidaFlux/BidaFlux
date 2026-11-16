import type { Campaign } from "@/lib/campaign";
import { chainById } from "@/lib/chains";
import { fmtDuration, fmtToken, shortAddr } from "@/lib/format";

/** What the seller sees instead of the buyer panel: their own auction's status and what happens next. */
export default function SellerPanel({ campaign, now }: { campaign: Campaign; now: bigint }) {
  const remaining = Number(campaign.expiry - now);
  return (
    <div className="card">
      <h2>You are the seller</h2>
      {campaign.state === "Active" && (
        <>
          <p>
            Your NFT is held in escrow and buyers on every enabled chain can bid for it.{" "}
            {remaining > 0 ? `The auction ends in ${fmtDuration(remaining)}.` : "The auction has ended; any intent already in flight can still settle."}
          </p>
          <p className="small">
            If a buyer wins, you are paid on the chain they bid from and the NFT moves to them automatically. If nobody wins you can
            reclaim the NFT once the grace period after expiry has passed.
          </p>
        </>
      )}
      {campaign.state === "Settled" && (
        <p className="ok">
          Sold for {fmtToken(campaign.price)} bUSD to {shortAddr(campaign.winner)}, who bid from{" "}
          {chainById(Number(campaign.winnerChainId))?.name ?? `chain ${campaign.winnerChainId}`}. Your payout is on that chain.
        </p>
      )}
      {campaign.state === "Reclaimed" && <p>You reclaimed the unsold NFT. It is back in your wallet.</p>}
      <p className="small">
        Sellers can&apos;t bid on their own auction. To bid, disconnect and connect a different wallet account.
      </p>
    </div>
  );
}
