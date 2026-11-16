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
import MyIntents from "./MyIntents";
import TxButton from "./TxButton";

export default function BuyerPanel({ campaign }: { campaign: Campaign }) {
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

  let parsed = 0n;
  try {
    parsed = parseUnits(amount || "0", TOKEN_DECIMALS);
  } catch {
    /* invalid input leaves 0 and disables the buttons */
  }
  const enabledHere = Boolean(payout.data && payout.data[0] !== zeroAddress);
  const active = campaign.state === "Active";
  const needsApproval = (allowance.data ?? 0n) < parsed;

  return (
    <>
      <div className="card">
        <h2>Bid from</h2>
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

        <div className="row" style={{ alignItems: "flex-start" }}>
          <TxButton
            chainId={chainId}
            label="1. Get test bUSD"
            disabled={parsed === 0n || parsed > parseUnits("10000", TOKEN_DECIMALS)}
            request={() => ({ address: token, abi: tokenAbi, functionName: "faucet", args: [parsed], chainId })}
            onDone={refresh}
          />
          <TxButton
            chainId={chainId}
            label="2. Approve"
            disabled={parsed === 0n || !needsApproval}
            request={() => ({ address: token, abi: tokenAbi, functionName: "approve", args: [vault, parsed], chainId })}
            onDone={refresh}
          />
          <TxButton
            chainId={chainId}
            label="3. Deposit"
            disabled={parsed === 0n || needsApproval}
            request={() => ({ address: vault, abi: vaultAbi, functionName: "deposit", args: [parsed], chainId })}
            onDone={refresh}
          />
          <TxButton
            chainId={chainId}
            label="Withdraw"
            disabled={parsed === 0n || (vaultBal.data ?? 0n) < parsed}
            request={() => ({ address: vault, abi: vaultAbi, functionName: "withdraw", args: [parsed], chainId })}
            onDone={refresh}
          />
        </div>
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
          disabled={!active || !enabledHere || (vaultBal.data ?? 0n) === 0n}
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
      </div>

      <MyIntents campaignId={campaign.id} />
    </>
  );
}
