"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { escrowAbi } from "@/abi";
import type { Campaign } from "@/lib/campaign";
import { CANONICAL_CHAIN } from "@/lib/chains";
import { deployment, GRACE_SECONDS } from "@/lib/config";
import TxButton from "./TxButton";

/** Seller reclaim and the permissionless settlement replay. Shown only when they can apply. */
export default function CampaignActions({ campaign, now }: { campaign: Campaign; now: bigint }) {
  const { address } = useAccount();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries();
  const isSeller = address?.toLowerCase() === campaign.seller.toLowerCase();
  const reclaimable = campaign.state === "Active" && now > campaign.expiry + BigInt(GRACE_SECONDS);
  const settled = campaign.state === "Settled";

  if (!(isSeller && reclaimable) && !settled && !(isSeller && campaign.state === "Active")) return null;
  return (
    <div className="card">
      <h2>Actions</h2>
      {isSeller && campaign.state === "Active" && (
        <>
          <TxButton
            chainId={CANONICAL_CHAIN.id}
            label="Reclaim unsold NFT"
            disabled={!reclaimable}
            request={() => ({ address: deployment.escrow!, abi: escrowAbi, functionName: "reclaim", args: [campaign.id], chainId: CANONICAL_CHAIN.id })}
            onDone={refresh}
          />
          {!reclaimable && (
            <p className="small">
              Available {GRACE_SECONDS}s after expiry, so an intent already in flight can still settle first.
            </p>
          )}
        </>
      )}
      {settled && (
        <>
          <TxButton
            chainId={CANONICAL_CHAIN.id}
            label="Re-send settlement to vaults"
            request={() => ({ address: deployment.escrow!, abi: escrowAbi, functionName: "replaySettlement", args: [campaign.id], chainId: CANONICAL_CHAIN.id })}
            onDone={refresh}
          />
          <p className="small">
            Recovery step: if the seller payout or loser unlocks never arrive, this re-emits the settlement event so Reactive relays it
            again. It changes no state.
          </p>
        </>
      )}
    </div>
  );
}
