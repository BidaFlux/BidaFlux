import assert from "node:assert/strict";
import { test } from "node:test";
import { nextChunk } from "./rpcRange.js";

// Messages copied from the public Base Sepolia, Unichain Sepolia, publicnode and drpc endpoints.
test("reads the limit out of each provider's error text", () => {
  assert.equal(nextChunk("eth_getLogs is limited to a 200 range", 9000n), 200n);
  assert.equal(nextChunk("block range greater than 1000 max", 9000n), 1000n);
  assert.equal(nextChunk("exceed maximum block range: 50000", 70000n), 50000n);
  assert.equal(nextChunk("ranges over 10000 blocks are not supported on free plan", 70000n), 10000n);
});

test("halves the range when the message names no limit", () => {
  assert.equal(nextChunk("query returned more than results", 9000n), 4500n);
});

test("gives up on unrelated errors and on ranges that cannot shrink", () => {
  assert.equal(nextChunk("connection refused", 9000n), undefined);
  assert.equal(nextChunk("limit exceeded", 150n), undefined);
});
