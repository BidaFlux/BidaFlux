/** The one place that decides what state an auction is in. Badges, strips, filters and the purchase panel all use it. */
export type AuctionStatus = "active" | "processing" | "sold" | "expired";

export const STATUS_LABEL: Record<AuctionStatus, string> = {
  active: "Active",
  processing: "Processing",
  sold: "Sold",
  expired: "Expired",
};

/** Seconds an intent may wait for its escrow decision before the UI says the Reactive callback is late. */
export const LONG_PENDING_SECONDS = 300;
/** Matches AuctionEscrow.GRACE: the last moment a relayed intent can still be accepted after expiry. */
const GRACE = 120n;

export interface StatusInput {
  /** AuctionEscrow state name. */
  state: "None" | "Active" | "Settled" | "Reclaimed";
  expiry: bigint;
  /** Chain time in seconds. */
  now: bigint;
  /** Intents with an IntentSubmitted but no Settled or IntentRejected yet. */
  pendingIntents: number;
}

/**
 * Sold means the escrow's Settled state and nothing else.
 * Processing is derived: no contract state reserves an auction while an intent is in flight.
 * An unanswered intent can still win until expiry plus the grace window, after which it would be rejected as stale.
 */
export function auctionStatus(i: StatusInput): AuctionStatus | undefined {
  if (i.state === "None") return undefined;
  if (i.state === "Settled") return "sold";
  if (i.state === "Reclaimed") return "expired";
  if (i.pendingIntents > 0 && i.now <= i.expiry + GRACE) return "processing";
  return i.now > i.expiry ? "expired" : "active";
}

/** Wording for one pending intent. Never "failed": the callback may simply not have arrived yet. */
export function pendingLabel(ageSeconds: number): string {
  return ageSeconds > LONG_PENDING_SECONDS ? "Pending 5+ min, awaiting Reactive callback" : "Awaiting escrow decision";
}

export const FILTERS = ["All", "Active", "Processing", "Sold", "Expired"] as const;
export type Filter = (typeof FILTERS)[number];

export function matchesFilter(status: AuctionStatus, filter: Filter): boolean {
  return filter === "All" || STATUS_LABEL[status] === filter;
}
