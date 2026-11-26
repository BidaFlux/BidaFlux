import type { AuctionData } from "./auctionData";
import { reactiveFor, type Intent, type ReactiveLink } from "./intents";
import { blockTimestamp } from "./logs";
import type { ReactiveTx } from "./reactiveTxs";

export const REJECT_REASONS: Record<number, string> = {
  1: "campaign not active",
  2: "duplicate intent",
  3: "outside auction window",
  4: "stale (callback too late)",
  5: "chain not enabled",
  6: "lock below price",
};

export interface Step {
  chainId: number;
  txHash: `0x${string}`;
  ts: bigint;
}

export interface ActivityRow {
  intent: Intent;
  /** 1. Buyer's intent on the source chain. Its time is the event's own intentTs. */
  source: Step;
  /** 2. Escrow decision on Base. */
  decision?: Step;
  /** 3. Vault outcome on the buyer's chain. */
  vault?: Step;
  /** Lasna transactions that carried each callback, when found. */
  reactive: { hop1?: ReactiveLink; hop2?: ReactiveLink };
  /** Whole seconds between block timestamps; undefined until both ends exist. */
  hop1?: number;
  hop2?: number;
}

const diff = (a?: bigint, b?: bigint) => (a !== undefined && b !== undefined ? Number(b - a) : undefined);

/** Adds block timestamps (cached per block) to the shared intent data. Never fills in a step that has no log. */
export async function buildActivity(data: AuctionData, reactive: ReactiveTx[]): Promise<ActivityRow[]> {
  const step = async (r?: { chainId: number; txHash: `0x${string}`; blockNumber: bigint }): Promise<Step | undefined> =>
    r ? { chainId: r.chainId, txHash: r.txHash, ts: await blockTimestamp(r.chainId, r.blockNumber) } : undefined;

  const rows = await Promise.all(
    data.intents.map(async (intent): Promise<ActivityRow> => {
      const [decision, vault] = await Promise.all([step(intent.decision), step(intent.vault)]);
      const source: Step = { chainId: intent.source.chainId, txHash: intent.source.txHash, ts: intent.intentTs };
      return {
        intent,
        source,
        decision,
        vault,
        reactive: reactiveFor(intent, reactive),
        hop1: diff(source.ts, decision?.ts),
        hop2: diff(decision?.ts, vault?.ts),
      };
    }),
  );
  return rows.sort((a, b) => Number(b.source.ts - a.source.ts));
}
