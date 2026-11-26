/** Joins the five intent-related event streams into one record per intent. Pure: no network, no invented data. */
export interface Ref {
  chainId: number;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

export interface LogLike extends Ref {
  args: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface Intent {
  intentId: `0x${string}`;
  campaignId: `0x${string}`;
  buyer: `0x${string}`;
  lockAmount: bigint;
  /** Source-chain block timestamp from the IntentSubmitted event. */
  intentTs: bigint;
  source: Ref;
  /** The escrow's decision on Base. Absent while the intent is still pending. */
  decision?: Ref & { kind: "settled" | "rejected"; reason?: number; price?: bigint };
  /** What the buyer's vault did afterwards. Absent until the second callback lands. */
  vault?: Ref & { kind: "paid" | "unlocked" };
}

const ref = (l: LogLike): Ref => ({ chainId: l.chainId, txHash: l.txHash, blockNumber: l.blockNumber });

export function groupIntents(i: {
  submitted: LogLike[];
  settled: LogLike[];
  rejected: LogLike[];
  paid: LogLike[];
  unlocked: LogLike[];
}): Intent[] {
  const decisions = new Map<string, NonNullable<Intent["decision"]>>();
  // Settled wins; a later duplicate rejection of the same intent must not replace it.
  for (const l of i.settled) decisions.set(l.args.intentId, { ...ref(l), kind: "settled", price: l.args.price });
  for (const l of i.rejected) {
    if (!decisions.has(l.args.intentId)) decisions.set(l.args.intentId, { ...ref(l), kind: "rejected", reason: Number(l.args.reason) });
  }
  const outcomes = new Map<string, NonNullable<Intent["vault"]>>();
  for (const l of i.paid) outcomes.set(l.args.intentId, { ...ref(l), kind: "paid" });
  for (const l of i.unlocked) if (!outcomes.has(l.args.intentId)) outcomes.set(l.args.intentId, { ...ref(l), kind: "unlocked" });

  return i.submitted.map((l) => ({
    intentId: l.args.intentId,
    campaignId: l.args.campaignId,
    buyer: l.args.buyer,
    lockAmount: l.args.lockAmount,
    intentTs: l.args.intentTs,
    source: ref(l),
    decision: decisions.get(l.args.intentId),
    vault: outcomes.get(l.args.intentId),
  }));
}

export function groupByCampaign(intents: Intent[]): Map<string, Intent[]> {
  const m = new Map<string, Intent[]>();
  for (const it of intents) m.set(it.campaignId, [...(m.get(it.campaignId) ?? []), it]);
  return m;
}

/** Intents with no Settled or IntentRejected yet. */
export const pendingOf = (intents: Intent[] = []) => intents.filter((i) => !i.decision);

/** Age in seconds of the oldest pending intent, or undefined when none is pending. */
export function oldestPendingAge(intents: Intent[] = [], now: bigint): number | undefined {
  const p = pendingOf(intents);
  return p.length ? Number(now - p.reduce((a, b) => (a.intentTs < b.intentTs ? a : b)).intentTs) : undefined;
}

export interface SettlementSummary {
  winner?: Intent;
  /** SellerPaid seen on the winner's vault. */
  sellerPaid: boolean;
  losers: { total: number; unlocked: number; pending: number };
}

/** Seller payout and loser unlocks are reported separately: each has its own on-chain event. */
export function settlementSummary(intents: Intent[] = [], winnerIntent: string): SettlementSummary {
  const winner = intents.find((i) => i.intentId === winnerIntent);
  const others = intents.filter((i) => i.intentId !== winnerIntent);
  return {
    winner,
    sellerPaid: winner?.vault?.kind === "paid",
    losers: {
      total: others.length,
      unlocked: others.filter((i) => i.vault?.kind === "unlocked").length,
      pending: others.filter((i) => !i.decision).length,
    },
  };
}

export interface ReactiveLike {
  txHash: `0x${string}`;
  blockNumber: bigint;
  destChainId: number;
  kind: "settle" | "finalize" | "release";
  intentId: string;
}
export type ReactiveLink = Pick<ReactiveLike, "txHash" | "blockNumber">;

/**
 * The Lasna transactions that carried this intent's two callbacks, if they exist yet.
 * hop 1: settle (intent to escrow). hop 2: finalize on the winner's chain (seller payout) or release (loser unlock).
 */
export function reactiveFor(intent: Intent, txs: ReactiveLike[]): { hop1?: ReactiveLink; hop2?: ReactiveLink } {
  const first = (f: (t: ReactiveLike) => boolean) => txs.filter(f).sort((a, b) => Number(a.blockNumber - b.blockNumber))[0];
  const hop1 = first((t) => t.kind === "settle" && t.intentId === intent.intentId);
  const hop2 =
    intent.decision?.kind === "settled"
      ? first((t) => t.kind === "finalize" && t.intentId === intent.intentId && t.destChainId === intent.source.chainId)
      : intent.decision
        ? first((t) => t.kind === "release" && t.intentId === intent.intentId)
        : undefined;
  return { hop1, hop2 };
}
