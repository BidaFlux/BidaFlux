import { escrowAbi, vaultAbi } from "@/abi";
import { CANONICAL_CHAIN } from "./chains";
import { deployment } from "./config";
import { blockTimestamp, getEventLogs, type DecodedLog } from "./logs";

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

export interface IntentRow {
  intentId: `0x${string}`;
  campaignId: `0x${string}`;
  buyer: string;
  lockAmount: bigint;
  /** 1. Buyer's intent on the source chain. */
  source: Step;
  /** 2. Escrow decision on Base, delivered by the Reactive callback. */
  decision?: Step & { kind: "settled" | "rejected"; reason?: number; price?: bigint };
  /** 3. Vault outcome on the buyer's chain, delivered by the second Reactive callback. */
  vault?: Step & { kind: "paid" | "unlocked" };
  /** Seconds between block timestamps; undefined until both ends exist. */
  hop1?: number;
  hop2?: number;
}

const withTime = async (l: DecodedLog): Promise<Step> => ({
  chainId: l.chainId,
  txHash: l.txHash,
  ts: await blockTimestamp(l.chainId, l.blockNumber),
});

/** Assembles every intent's lifecycle from on-chain events. Never fills in a step that has no log. */
export async function loadActivity(): Promise<IntentRow[]> {
  const escrow = deployment.escrow!;
  const vaultChains = Object.keys(deployment.vault).map(Number).filter((id) => deployment.vault[id]);

  const [settled, rejected, perChain] = await Promise.all([
    getEventLogs({ chainId: CANONICAL_CHAIN.id, address: escrow, abi: escrowAbi, eventName: "Settled" }),
    getEventLogs({ chainId: CANONICAL_CHAIN.id, address: escrow, abi: escrowAbi, eventName: "IntentRejected" }),
    Promise.all(
      vaultChains.map(async (chainId) => {
        const address = deployment.vault[chainId]!;
        const [submitted, paid, unlocked] = await Promise.all(
          ["IntentSubmitted", "SellerPaid", "IntentUnlocked"].map((eventName) => getEventLogs({ chainId, address, abi: vaultAbi, eventName })),
        );
        return { submitted, paid, unlocked };
      }),
    ),
  ]);

  const decisions = new Map<string, Promise<IntentRow["decision"]>>();
  for (const l of settled) {
    decisions.set(l.args.intentId, withTime(l).then((s) => ({ ...s, kind: "settled" as const, price: l.args.price as bigint })));
  }
  for (const l of rejected) {
    // A duplicate rejection refers to an intent that already has a decision; keep the first one.
    if (!decisions.has(l.args.intentId)) {
      decisions.set(l.args.intentId, withTime(l).then((s) => ({ ...s, kind: "rejected" as const, reason: Number(l.args.reason) })));
    }
  }

  const vaultOutcomes = new Map<string, Promise<IntentRow["vault"]>>();
  for (const { paid, unlocked } of perChain) {
    for (const l of paid) vaultOutcomes.set(l.args.intentId, withTime(l).then((s) => ({ ...s, kind: "paid" as const })));
    for (const l of unlocked) vaultOutcomes.set(l.args.intentId, withTime(l).then((s) => ({ ...s, kind: "unlocked" as const })));
  }

  const rows = await Promise.all(
    perChain.flatMap(({ submitted }) => submitted).map(async (l): Promise<IntentRow> => {
      const intentId = l.args.intentId as `0x${string}`;
      const [source, decision, vault] = await Promise.all([withTime(l), decisions.get(intentId), vaultOutcomes.get(intentId)]);
      const diff = (a?: bigint, b?: bigint) => (a !== undefined && b !== undefined ? Number(b - a) : undefined);
      return {
        intentId,
        campaignId: l.args.campaignId,
        buyer: l.args.buyer,
        lockAmount: l.args.lockAmount,
        source,
        decision,
        vault,
        hop1: diff(source.ts, decision?.ts),
        hop2: decision?.kind === "settled" ? diff(decision.ts, vault?.ts) : undefined,
      };
    }),
  );
  return rows.sort((a, b) => Number(b.source.ts - a.source.ts));
}
