"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { parseUnits, zeroAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { escrowAbi, tokenAbi, vaultAbi } from "@/abi";
import { buyerChains, CANONICAL_CHAIN } from "@/lib/chains";
import type { Campaign } from "@/lib/campaign";
import { deployment, TOKEN_DECIMALS } from "@/lib/config";
import { fmtToken } from "@/lib/format";
import { publicClientFor } from "@/lib/logs";
import { bidSteps, preflight } from "@/lib/bidSteps";
import BidProgress from "./BidProgress";
import MyIntents from "./MyIntents";
import TxButton from "./TxButton";

export default function BuyerPanel({ campaign, now }: { campaign: Campaign; now: bigint }) {
  const { address } = useAccount();
  const qc = useQueryClient();
  const [chainId, setChainId] = useState<number>(CANONICAL_CHAIN.id);
  const [amount, setAmount] = useState("1000");
  const vault = deployment.vault[chainId]!;
  const token = deployment.token[chainId]!;
  const refresh = () => qc.invalidateQueries();
  const live = { chainId, query: { enabled: Boolean(address), refetchInterval: 4_000 } };

  const walletBal = useReadContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [address ?? zeroAddress], ...live });
  const vaultBal = useReadContract({ address: vault, abi: vaultAbi, functionName: "balance", args: [address ?? zeroAddress], ...live });
  const allowance = useReadContract({ address: token, abi: tokenAbi, functionName: "allowance", args: [address ?? zeroAddress, vault], ...live });
  const payout = useReadContract({
    address: deployment.escrow!,
    abi: escrowAbi,
    functionName: "payouts",
    args: [campaign.id, BigInt(chainId)],
    chainId: CANONICAL_CHAIN.id,
  });

  // The price the escrow itself would charge right now; it only falls, so it is also what a new intent would lock.
  const price = useReadContract({
    address: deployment.escrow!,
    abi: escrowAbi,
    functionName: "currentPrice",
    args: [campaign.id],
    chainId: CANONICAL_CHAIN.id,
    query: { enabled: campaign.state === "Active", refetchInterval: 4_000 },
  });

  let parsed = 0n;
  try {
    parsed = parseUnits(amount || "0", TOKEN_DECIMALS);
  } catch {
    /* invalid input leaves 0 and disables the buttons */
  }
  const enabledHere = Boolean(payout.data && payout.data[0] !== zeroAddress);
  const active = campaign.state === "Active";
  const needsApproval = (allowance.data ?? 0n) < parsed;
  const steps = bidSteps({
    amount: parsed,
    price: price.data ?? 0n,
    walletBal: walletBal.data ?? 0n,
    vaultBal: vaultBal.data ?? 0n,
    allowance: allowance.data ?? 0n,
  });
  const check = preflight(
    {
      amount: parsed,
      price: price.data ?? 0n,
      walletBal: walletBal.data ?? 0n,
      vaultBal: vaultBal.data ?? 0n,
      allowance: allowance.data ?? 0n,
      active,
      secondsLeft: Number(campaign.expiry - now),
    },
    fmtToken,
  );

  const blocked = payout.isSuccess && !enabledHere;
  const actionButton = (key: "faucet" | "approve" | "deposit" | "withdraw", label: string) => {
    switch (key) {
      case "faucet":
        return (
          <TxButton
            chainId={chainId}
            label={label}
            disabled={blocked || parsed === 0n || parsed > parseUnits("10000", TOKEN_DECIMALS)}
            request={() => ({ address: token, abi: tokenAbi, functionName: "faucet", args: [parsed], chainId })}
            onDone={refresh}
          />
        );
      case "approve":
        return (
          <TxButton
            chainId={chainId}
            label={label}
            disabled={blocked || parsed === 0n || !needsApproval}
            request={() => ({ address: token, abi: tokenAbi, functionName: "approve", args: [vault, parsed], chainId })}
            onDone={refresh}
          />
        );
      case "deposit":
        return (
          <TxButton
            chainId={chainId}
            label={label}
            disabled={blocked || parsed === 0n || needsApproval || Boolean(check.deposit)}
            request={() => ({ address: vault, abi: vaultAbi, functionName: "deposit", args: [parsed], chainId })}
            onDone={refresh}
          />
        );
      case "withdraw":
        return (
          <TxButton
            chainId={chainId}
            label={label}
            disabled={parsed === 0n || (vaultBal.data ?? 0n) < parsed}
            request={() => ({ address: vault, abi: vaultAbi, functionName: "withdraw", args: [parsed], chainId })}
            onDone={refresh}
          />
        );
    }
  };
  const STEP_LABEL = { faucet: "Get test bUSD", approve: "Approve the vault", deposit: "Deposit into the vault" } as const;
  const current = steps.find((st) => st.status === "current")?.key;
  const primary = current === "faucet" || current === "approve" || current === "deposit" ? current : null;
  const allButtons = (
    <>
      {actionButton("faucet", "1. Get test bUSD")}
      {actionButton("approve", "2. Approve")}
      {actionButton("deposit", "3. Deposit")}
      {actionButton("withdraw", "Withdraw")}
    </>
  );

  return (
    <>
      <div className="card">
        <h2>Bid from</h2>
        {address && active && <BidProgress steps={steps} />}
        <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
          {buyerChains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {!enabledHere && payout.isSuccess && <p className="err small">The seller did not enable this chain for this campaign.</p>}
        {address && (
          <p className="small">
            Wallet: {fmtToken(walletBal.data ?? 0n)} bUSD · Vault balance: {fmtToken(vaultBal.data ?? 0n)} bUSD
          </p>
        )}
        <p className="small">
          An intent is a request to compete for the NFT, not a completed purchase. Your funds are held in the vault on the chain
          you bid from; the seller is paid on that chain only if you win.
        </p>

        <label>Amount (bUSD)</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />

        {address && active && (
          <div style={{ margin: "12px 0" }}>
            {primary ? (
              <>
                <p className="small">Next step</p>
                {actionButton(primary, STEP_LABEL[primary])}
              </>
            ) : (
              <p className="ok small">Your vault is funded. Submit your intent below.</p>
            )}
          </div>
        )}

        {address && active ? (
          <details>
            <summary className="small">All actions</summary>
            <div className="row" style={{ alignItems: "flex-start" }}>{allButtons}</div>
          </details>
        ) : (
          <div className="row" style={{ alignItems: "flex-start" }}>{allButtons}</div>
        )}
        {check.deposit && <p className="small err">{check.deposit}</p>}
      </div>

      <div className="card">
        <h2>Submit intent</h2>
        <p className="small">
          Locks the current price from your vault balance. If you win you pay the price at the moment your intent was submitted and
          the remainder is returned.
        </p>
        <TxButton
          chainId={chainId}
          label="4. Submit purchase intent"
          disabled={!active || !enabledHere || (vaultBal.data ?? 0n) === 0n || Boolean(check.submit)}
          request={async () => {
            // Read the price the escrow itself would compute now; it only falls afterwards, so locking it covers the intent.
            const price = await publicClientFor(CANONICAL_CHAIN.id).readContract({
              address: deployment.escrow!,
              abi: escrowAbi,
              functionName: "currentPrice",
              args: [campaign.id],
            });
            return { address: vault, abi: vaultAbi, functionName: "submitIntent", args: [campaign.id, price], chainId };
          }}
          onDone={refresh}
        />
        {!active && <p className="small">This campaign is no longer active.</p>}
        {active && check.submit && <p className="small err">{check.submit}</p>}
        {active && check.warning && <p className="small warn-text">{check.warning}</p>}
      </div>

      <MyIntents campaignId={campaign.id} />
    </>
  );
}
