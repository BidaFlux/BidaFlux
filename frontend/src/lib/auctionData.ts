"use client";

import { useQuery } from "@tanstack/react-query";
import { escrowAbi, vaultAbi } from "@/abi";
import { readCampaign, type Campaign } from "./campaign";
import { CANONICAL_CHAIN } from "./chains";
import { deployment } from "./config";
import { groupByCampaign, groupIntents, type Intent } from "./intents";
import { getEventLogs } from "./logs";

export interface AuctionData {
  /** Newest first. */
  campaigns: Campaign[];
  /** Chains each campaign accepts bids from, from its ChainEnabled events. */
  enabledChains: Map<string, number[]>;
  intents: Intent[];
  intentsByCampaign: Map<string, Intent[]>;
}

/**
 * One load for every page: campaigns plus every intent event, grouped by campaign and intent.
 * Event logs come from the incremental cache in logs.ts, so repeated loads only scan new blocks.
 */
export async function loadAuctionData(): Promise<AuctionData> {
  const escrow = deployment.escrow!;
  const canon = { chainId: CANONICAL_CHAIN.id, address: escrow, abi: escrowAbi };
  const vaultChains = Object.keys(deployment.vault).map(Number).filter((id) => deployment.vault[id]);

  const [created, enabled, settled, rejected, perChain] = await Promise.all([
    getEventLogs({ ...canon, eventName: "CampaignCreated" }),
    getEventLogs({ ...canon, eventName: "ChainEnabled" }),
    getEventLogs({ ...canon, eventName: "Settled" }),
    getEventLogs({ ...canon, eventName: "IntentRejected" }),
    Promise.all(
      vaultChains.map(async (chainId) => {
        const v = { chainId, address: deployment.vault[chainId]!, abi: vaultAbi };
        const [submitted, paid, unlocked] = await Promise.all(
          (["IntentSubmitted", "SellerPaid", "IntentUnlocked"] as const).map((eventName) => getEventLogs({ ...v, eventName })),
        );
        return { submitted, paid, unlocked };
      }),
    ),
  ]);

  const enabledChains = new Map<string, number[]>();
  for (const l of enabled) {
    const id = l.args.campaignId as string;
    enabledChains.set(id, [...(enabledChains.get(id) ?? []), Number(l.args.chainId)]);
  }
  const intents = groupIntents({
    submitted: perChain.flatMap((c) => c.submitted),
    settled,
    rejected,
    paid: perChain.flatMap((c) => c.paid),
    unlocked: perChain.flatMap((c) => c.unlocked),
  });
  const campaigns = await Promise.all(created.map((l) => readCampaign(l.args.campaignId as `0x${string}`)));
  return { campaigns: campaigns.reverse(), enabledChains, intents, intentsByCampaign: groupByCampaign(intents) };
}

/** Shared by Auctions, Campaign and Activity so they all read the same cache entry. */
export function useAuctionData() {
  return useQuery({ queryKey: ["auction-data", deployment.escrow], enabled: Boolean(deployment.escrow), refetchInterval: 10_000, queryFn: loadAuctionData });
}
