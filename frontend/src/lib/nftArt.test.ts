import assert from "node:assert/strict";
import { test } from "node:test";
import { gradientFor, parseDataJson, resolveUri } from "./nftArt.js";

test("ipfs uris go through a gateway", () => {
  assert.equal(resolveUri("ipfs://Qm123/1.json"), "https://ipfs.io/ipfs/Qm123/1.json");
  assert.equal(resolveUri("ipfs://ipfs/Qm123"), "https://ipfs.io/ipfs/Qm123");
});
test("empty or unknown schemes give nothing", () => {
  assert.equal(resolveUri(""), undefined);
  assert.equal(resolveUri("ftp://x"), undefined);
});
test("data uris decode, bad ones do not throw", () => {
  const j = Buffer.from(JSON.stringify({ image: "ipfs://a" })).toString("base64");
  assert.deepEqual(parseDataJson(`data:application/json;base64,${j}`), { image: "ipfs://a" });
  assert.equal(parseDataJson("data:application/json,{nope"), undefined);
});
test("gradient is deterministic and differs per token", () => {
  assert.equal(gradientFor(5n), gradientFor(5n));
  assert.notEqual(gradientFor(5n), gradientFor(6n));
});
