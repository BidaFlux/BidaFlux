import assert from "node:assert/strict";
import { test } from "node:test";
import { bidSteps } from "./bidSteps.js";

const base = { amount: 1000n, price: 500n, walletBal: 0n, vaultBal: 0n, allowance: 0n };
const status = (i: Parameters<typeof bidSteps>[0]) => bidSteps(i).map((s) => s.status).join(",");

test("a buyer with nothing starts at the faucet", () => {
  assert.equal(status(base), "current,todo,todo,todo");
});

test("tokens in the wallet move the buyer on to approve, then deposit", () => {
  assert.equal(status({ ...base, walletBal: 1000n }), "done,current,todo,todo");
  assert.equal(status({ ...base, walletBal: 1000n, allowance: 1000n }), "done,done,current,todo");
});

test("a vault that covers the current price means only submit is left", () => {
  assert.equal(status({ ...base, vaultBal: 500n }), "done,done,done,current");
});

test("a vault below the current price does not count as ready", () => {
  assert.equal(status({ ...base, vaultBal: 499n }), "current,todo,todo,todo");
});

test("an unknown price or a zero amount never marks steps done by accident", () => {
  assert.equal(status({ ...base, price: 0n, vaultBal: 500n }), "current,todo,todo,todo");
  assert.equal(status({ ...base, amount: 0n, walletBal: 1000n, allowance: 1000n }), "current,todo,todo,todo");
});
