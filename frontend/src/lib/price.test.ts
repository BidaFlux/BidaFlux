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
