"use client";

import { useQuery } from "@tanstack/react-query";
import { escrowAbi, vaultAbi } from "@/abi";
import { readCampaign, type Campaign } from "./campaign";
import { CANONICAL_CHAIN } from "./chains";
import { deployment } from "./config";
import { groupByCampaign, groupIntents, type Intent } from "./intents";
import { getEventLogs } from "./logs";

/** An auction or vault event that is not part of an intent's lifecycle. Shown on Activity so every transaction has a place. */
export interface FeedEvent {
  kind: "created" | "reclaimed" | "deposited" | "withdrawn";
  chainId: number;
  txHash: `0x${string}`;
  blockNumber: bigint;
  campaignId?: `0x${string}`;
  tokenId?: bigint;
  account?: `0x${string}`;
  amount?: bigint;
  /** Only CampaignCreated carries its own timestamp (start); other events need their block's. */
  ts?: bigint;
}

export interface AuctionData {
  /** Auction creations, reclaims and vault deposits/withdrawals, newest first. */
  feed: FeedEvent[];
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

  const [created, enabled, settled, rejected, reclaimed, perChain] = await Promise.all([
    getEventLogs({ ...canon, eventName: "CampaignCreated" }),
    getEventLogs({ ...canon, eventName: "ChainEnabled" }),
    getEventLogs({ ...canon, eventName: "Settled" }),
    getEventLogs({ ...canon, eventName: "IntentRejected" }),
    getEventLogs({ ...canon, eventName: "Reclaimed" }),
    Promise.all(
      vaultChains.map(async (chainId) => {
        const v = { chainId, address: deployment.vault[chainId]!, abi: vaultAbi };
        const [submitted, paid, unlocked, deposited, withdrawn] = await Promise.all(
          (["IntentSubmitted", "SellerPaid", "IntentUnlocked", "Deposited", "Withdrawn"] as const).map((eventName) => getEventLogs({ ...v, eventName })),
        );
        return { submitted, paid, unlocked, deposited, withdrawn };
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
  const base = (l: { chainId: number; txHash: `0x${string}`; blockNumber: bigint }) => ({ chainId: l.chainId, txHash: l.txHash, blockNumber: l.blockNumber });
  const feed: FeedEvent[] = [
    ...created.map((l): FeedEvent => ({ ...base(l), kind: "created", campaignId: l.args.campaignId, tokenId: l.args.tokenId, account: l.args.seller, ts: l.args.start })),
    ...reclaimed.map((l): FeedEvent => ({ ...base(l), kind: "reclaimed", campaignId: l.args.campaignId })),
    ...perChain.flatMap((c) => [
      ...c.deposited.map((l): FeedEvent => ({ ...base(l), kind: "deposited", account: l.args.buyer, amount: l.args.amount })),
      ...c.withdrawn.map((l): FeedEvent => ({ ...base(l), kind: "withdrawn", account: l.args.buyer, amount: l.args.amount })),
    ]),
  ].sort((a, b) => (a.ts !== undefined && b.ts !== undefined ? Number(b.ts - a.ts) : Number(b.blockNumber - a.blockNumber)));
  const campaigns = await Promise.all(created.map((l) => readCampaign(l.args.campaignId as `0x${string}`)));
  return { feed, campaigns: campaigns.reverse(), enabledChains, intents, intentsByCampaign: groupByCampaign(intents) };
}

/** Shared by Auctions, Campaign and Activity so they all read the same cache entry. */
export function useAuctionData() {
  return useQuery({ queryKey: ["auction-data", deployment.escrow], enabled: Boolean(deployment.escrow), refetchInterval: 10_000, queryFn: loadAuctionData });
}
