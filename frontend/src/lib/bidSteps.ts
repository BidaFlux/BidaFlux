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
