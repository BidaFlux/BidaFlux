export type StepKey = "faucet" | "approve" | "deposit" | "submit";
export type StepStatus = "done" | "current" | "todo";

export interface BidInputs {
  /** Amount the buyer is about to move, in token base units. */
  amount: bigint;
  /** The escrow's current Dutch price, in token base units (0 while unknown). */
  price: bigint;
  walletBal: bigint;
  vaultBal: bigint;
  allowance: bigint;
}

export interface Step {
  key: StepKey;
  label: string;
  status: StepStatus;
}

/**
 * Where the buyer is in faucet -> approve -> deposit -> submit. Once the vault already holds at least the current
 * price, the earlier steps no longer matter, so they count as done.
 */
export function bidSteps(i: BidInputs): Step[] {
  const vaultReady = i.price > 0n && i.vaultBal >= i.price;
  const done: Record<StepKey, boolean> = {
    faucet: vaultReady || (i.amount > 0n && i.walletBal >= i.amount),
    approve: vaultReady || (i.amount > 0n && i.allowance >= i.amount),
    deposit: vaultReady,
    submit: false,
  };
  const labels: Record<StepKey, string> = {
    faucet: "Get bUSD",
    approve: "Approve",
    deposit: "Deposit",
    submit: "Submit intent",
  };
  const order: StepKey[] = ["faucet", "approve", "deposit", "submit"];
  const firstOpen = order.find((k) => !done[k]) ?? "submit";
  return order.map((key) => ({
    key,
    label: labels[key],
    status: done[key] ? "done" : key === firstOpen ? "current" : "todo",
  }));
}

export interface PreflightInputs extends BidInputs {
  active: boolean;
  secondsLeft: number;
}

export interface Preflight {
  /** Why Deposit would fail right now, if it would. */
  deposit?: string;
  /** Why Submit intent would fail right now, if it would. */
  submit?: string;
  /** A heads-up that does not block anything. */
  warning?: string;
}

/** Plain-language reasons a step would fail, so the UI can stop the click before the wallet shows a raw revert. */
export function preflight(i: PreflightInputs, fmt: (v: bigint) => string): Preflight {
  const out: Preflight = {};
  if (i.amount > 0n && i.walletBal < i.amount) {
    out.deposit = `Your wallet has ${fmt(i.walletBal)} bUSD but you are depositing ${fmt(i.amount)}. Use "Get test bUSD" first.`;
  }
  if (i.price > 0n && i.vaultBal < i.price) {
    out.submit = `Your vault holds ${fmt(i.vaultBal)} bUSD but the current price is ${fmt(i.price)}. Deposit at least ${fmt(i.price - i.vaultBal)} more.`;
  }
  if (i.active && i.secondsLeft <= 0) {
    out.warning = "This auction has passed its end time, so a new intent will most likely be rejected.";
  } else if (i.active && i.secondsLeft <= 60) {
    out.warning = `Only ${i.secondsLeft}s left. After you submit, Reactive needs a few seconds to settle, so the auction may close first.`;
  }
  return out;
}
