import type { Address } from "viem";
import { escrowAbi } from "@/abi";
import { CANONICAL_CHAIN } from "./chains";
import { deployment } from "./config";
import { publicClientFor } from "./logs";
import type { PriceCurve } from "./price";

export const STATES = ["None", "Active", "Settled", "Reclaimed"] as const;

export interface Campaign extends PriceCurve {
  id: `0x${string}`;
  seller: Address;
  nft: Address;
  tokenId: bigint;
  expiry: bigint;
  state: (typeof STATES)[number];
  winnerIntent: `0x${string}`;
  winner: Address;
  winnerChainId: bigint;
  price: bigint;
}

/** Decodes the 14-field tuple returned by AuctionEscrow.campaigns(id). */
export function decodeCampaign(id: `0x${string}`, t: readonly unknown[]): Campaign {
  return {
    id,
    seller: t[0] as Address,
    nft: t[1] as Address,
    tokenId: t[2] as bigint,
    start: t[3] as bigint,
    expiry: t[4] as bigint,
    startPrice: t[5] as bigint,
    reservePrice: t[6] as bigint,
    decrement: t[7] as bigint,
    interval: t[8] as bigint,
    state: STATES[Number(t[9])] ?? "None",
    winnerIntent: t[10] as `0x${string}`,
    winner: t[11] as Address,
    winnerChainId: t[12] as bigint,
    price: t[13] as bigint,
  };
}

export async function readCampaign(id: `0x${string}`): Promise<Campaign> {
  const t = await publicClientFor(CANONICAL_CHAIN.id).readContract({
    address: deployment.escrow!,
    abi: escrowAbi,
    functionName: "campaigns",
    args: [id],
  });
  return decodeCampaign(id, t);
}
