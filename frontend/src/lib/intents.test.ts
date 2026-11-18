import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByCampaign, groupIntents, oldestPendingAge, pendingOf, type LogLike } from "./intents.js";

const log = (args: Record<string, unknown>, n = 1): LogLike => ({ chainId: 1, txHash: `0x${String(n).padStart(64, "0")}`, blockNumber: BigInt(n), args });
const sub = (intentId: string, campaignId: string, ts: bigint) => log({ intentId, campaignId, buyer: "0xb", lockAmount: 5n, intentTs: ts });

test("an intent with no decision is pending", () => {
  const r = groupIntents({ submitted: [sub("a", "c", 100n)], settled: [], rejected: [], paid: [], unlocked: [] });
  assert.equal(pendingOf(r).length, 1);
  assert.equal(r[0].decision, undefined);
});
test("settled and rejected resolve a pending intent; settled wins over a duplicate rejection", () => {
  const r = groupIntents({
    submitted: [sub("a", "c", 1n), sub("b", "c", 2n)],
    settled: [log({ intentId: "a", price: 9n })],
    rejected: [log({ intentId: "a", reason: 2 }), log({ intentId: "b", reason: 6 })],
    paid: [log({ intentId: "a" })],
    unlocked: [log({ intentId: "b" })],
  });
  assert.equal(r[0].decision?.kind, "settled");
  assert.equal(r[0].decision?.price, 9n);
  assert.equal(r[1].decision?.kind, "rejected");
  assert.equal(r[1].decision?.reason, 6);
  assert.equal(r[0].vault?.kind, "paid");
  assert.equal(r[1].vault?.kind, "unlocked");
  assert.equal(pendingOf(r).length, 0);
});
test("groups by campaign and finds the oldest pending age", () => {
  const r = groupIntents({ submitted: [sub("a", "c1", 100n), sub("b", "c1", 150n), sub("c", "c2", 10n)], settled: [], rejected: [], paid: [], unlocked: [] });
  const g = groupByCampaign(r);
  assert.equal(g.get("c1")?.length, 2);
  assert.equal(oldestPendingAge(g.get("c1"), 400n), 300);
  assert.equal(oldestPendingAge(undefined, 400n), undefined);
});

import { settlementSummary } from "./intents.js";

test("settlement summary separates seller payout from loser unlocks", () => {
  const r = groupIntents({
    submitted: [sub("w", "c", 1n), sub("l1", "c", 2n), sub("l2", "c", 3n)],
    settled: [log({ intentId: "w", price: 9n })],
    rejected: [log({ intentId: "l1", reason: 1 })],
    paid: [log({ intentId: "w" })],
    unlocked: [log({ intentId: "l1" })],
  });
  const s = settlementSummary(r, "w");
  assert.equal(s.sellerPaid, true);
  assert.deepEqual(s.losers, { total: 2, unlocked: 1, pending: 1 });
  assert.equal(settlementSummary(r, "none").winner, undefined);
});
