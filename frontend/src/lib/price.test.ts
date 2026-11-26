import assert from "node:assert/strict";
import { test } from "node:test";
import { priceAt } from "./price.js";

// Same curve and expectations as test_price_followsCurveAndFloorsAtReserve in contracts/test/AuctionEscrow.t.sol.
const c = { start: 1_000_000n, startPrice: 1000n, reservePrice: 500n, decrement: 50n, interval: 10n };

test("price follows the contract curve and floors at the reserve", () => {
  const at = (dt: bigint) => priceAt(c, c.start + dt);
  assert.equal(at(0n), 1000n);
  assert.equal(at(9n), 1000n);
  assert.equal(at(10n), 950n);
  assert.equal(at(80n), 600n);
  assert.equal(at(99n), 550n);
  assert.equal(at(100n), 500n);
  assert.equal(at(10_000n), 500n);
  assert.equal(priceAt(c, 2n ** 256n - 1n), 500n);
});

test("before start the price is the start price", () => {
  assert.equal(priceAt(c, c.start - 5n), 1000n);
});

import { curvePoints, reserveReachedAt } from "./price.js";

const curve = { start: 1000n, startPrice: 1000n, reservePrice: 500n, decrement: 50n, interval: 10n };

test("reserveReachedAt is when the curve bottoms out", () => {
  assert.equal(reserveReachedAt(curve), 100);
  assert.equal(priceAt(curve, 1100n), 500n);
  assert.equal(priceAt(curve, 1099n), 550n);
});
test("curvePoints starts at the start price, never rises, and agrees with priceAt", () => {
  const pts = curvePoints(curve, 300);
  assert.equal(pts[0].p, 1000n);
  assert.equal(pts.at(-1)?.p, 500n);
  assert.equal(pts.at(-1)?.t, 300);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].p <= pts[i - 1].p && pts[i].t >= pts[i - 1].t);
  for (const q of pts.filter((_, i) => i % 2 === 0)) assert.equal(q.p, priceAt(curve, 1000n + BigInt(q.t)));
});
test("a duration shorter than the drop ends above the reserve", () => {
  const pts = curvePoints(curve, 45);
  assert.equal(pts.at(-1)?.p, priceAt(curve, 1045n));
});
