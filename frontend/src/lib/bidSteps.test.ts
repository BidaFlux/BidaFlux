import assert from "node:assert/strict";
import { test } from "node:test";
import { bidSteps, preflight } from "./bidSteps.js";

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

const fmt = (v: bigint) => v.toString();
const pf = { ...base, active: true, secondsLeft: 300 };

test("deposit is blocked when the wallet holds less than the amount", () => {
  assert.match(preflight({ ...pf, walletBal: 400n }, fmt).deposit ?? "", /wallet has 400 bUSD but you are depositing 1000/);
  assert.equal(preflight({ ...pf, walletBal: 1000n }, fmt).deposit, undefined);
});

test("submit is blocked when the vault holds less than the current price, and says how much more", () => {
  assert.match(preflight({ ...pf, vaultBal: 300n }, fmt).submit ?? "", /holds 300 bUSD .* price is 500\. Deposit at least 200 more/);
  assert.equal(preflight({ ...pf, vaultBal: 500n }, fmt).submit, undefined);
});

test("short time left warns, expiry warns harder, plenty of time is quiet", () => {
  assert.match(preflight({ ...pf, secondsLeft: 45 }, fmt).warning ?? "", /Only 45s left/);
  assert.match(preflight({ ...pf, secondsLeft: 0 }, fmt).warning ?? "", /passed its end time/);
  assert.equal(preflight(pf, fmt).warning, undefined);
  assert.equal(preflight({ ...pf, active: false, secondsLeft: 0 }, fmt).warning, undefined);
});
