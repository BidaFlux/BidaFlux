import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtLatency, summarize } from "./latency.js";

test("nothing measured", () => {
  assert.equal(fmtLatency(summarize([])), "Not measured yet");
  assert.equal(fmtLatency(summarize([undefined, -3])), "Not measured yet");
});
test("average in whole seconds with the sample count", () => {
  assert.equal(fmtLatency(summarize([2, 3, undefined, 5])), "avg 3s (n=3)");
});
