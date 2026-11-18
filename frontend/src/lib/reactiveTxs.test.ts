import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeFunctionData, pad, parseAbi, toHex } from "viem";
import { decodeCallbackLog } from "./reactiveTxs.js";

const abi = parseAbi([
  "function settle(address rvm_, bytes32 campaignId, bytes32 intentId, address buyer, uint256 srcChainId, uint256 lockAmount, uint256 intentTs)",
  "function finalizeCampaign(address rvm_, bytes32 campaignId, bytes32 winnerIntentId, uint256 winnerChainId, uint256 price, address payout)",
  "function releaseIntent(address rvm_, bytes32 intentId)",
  "function other()",
]);
const a = "0x0000000000000000000000000000000000000001" as const;
const id = (n: number) => pad(toHex(n), { size: 32 });
const log = (data: `0x${string}`, chain = 84532n) => ({
  txHash: id(9),
  blockNumber: 5n,
  args: { topics: ["0xef94", pad(toHex(chain), { size: 32 }), id(1)], data: encodeAbiParameters([{ type: "bytes" }], [data]) },
});

test("decodes settle, finalize and release callbacks with their destination chain", () => {
  const s = decodeCallbackLog(log(encodeFunctionData({ abi, functionName: "settle", args: [a, id(1), id(2), a, 1301n, 5n, 7n] })));
  assert.deepEqual([s?.kind, s?.intentId, s?.destChainId], ["settle", id(2), 84532]);
  const f = decodeCallbackLog(log(encodeFunctionData({ abi, functionName: "finalizeCampaign", args: [a, id(1), id(3), 1301n, 5n, a] }), 1301n));
  assert.deepEqual([f?.kind, f?.intentId, f?.destChainId], ["finalize", id(3), 1301]);
  const r = decodeCallbackLog(log(encodeFunctionData({ abi, functionName: "releaseIntent", args: [a, id(4)] })));
  assert.deepEqual([r?.kind, r?.intentId], ["release", id(4)]);
});
test("ignores callbacks that are not coordinator calls", () => {
  assert.equal(decodeCallbackLog(log(encodeFunctionData({ abi, functionName: "other" }))), undefined);
  assert.equal(decodeCallbackLog({ txHash: id(1), blockNumber: 1n, args: { topics: [], data: "0x" } }), undefined);
});
