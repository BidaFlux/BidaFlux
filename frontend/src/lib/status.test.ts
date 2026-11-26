import assert from "node:assert/strict";
import { test } from "node:test";
import { auctionStatus, matchesFilter, pendingLabel, type StatusInput } from "./status.js";

const base: StatusInput = { state: "Active", expiry: 1000n, now: 500n, pendingIntents: 0 };

test("active before expiry with nothing pending", () => assert.equal(auctionStatus(base), "active"));
test("processing while an intent is unanswered", () => assert.equal(auctionStatus({ ...base, pendingIntents: 1 }), "processing"));
test("still processing inside the grace window after expiry", () =>
  assert.equal(auctionStatus({ ...base, now: 1100n, pendingIntents: 2 }), "processing"));
test("expired once grace passes, even with a stale pending intent", () =>
  assert.equal(auctionStatus({ ...base, now: 1121n, pendingIntents: 1 }), "expired"));
test("expired after expiry with nothing pending", () => assert.equal(auctionStatus({ ...base, now: 1001n }), "expired"));
test("sold only from the Settled state, whatever else is true", () => {
  assert.equal(auctionStatus({ ...base, state: "Settled", now: 9999n, pendingIntents: 3 }), "sold");
  assert.equal(auctionStatus({ ...base, pendingIntents: 0 }), "active");
});
test("reclaimed is expired; unknown campaign has no status", () => {
  assert.equal(auctionStatus({ ...base, state: "Reclaimed" }), "expired");
  assert.equal(auctionStatus({ ...base, state: "None" }), undefined);
});
test("pending wording switches after five minutes and never says failed", () => {
  assert.equal(pendingLabel(300), "Awaiting escrow decision");
  assert.equal(pendingLabel(301), "Pending 5+ min, awaiting Reactive callback");
  assert.ok(!/fail/i.test(pendingLabel(9999)));
});
test("filters", () => {
  assert.ok(matchesFilter("sold", "All") && matchesFilter("sold", "Sold") && !matchesFilter("sold", "Active"));
  assert.ok(matchesFilter("expired", "Expired") && matchesFilter("expired", "All"));
});
