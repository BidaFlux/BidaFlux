"use client";

import Link from "next/link";
import { useState } from "react";
import { isAddress, parseEventLogs, parseUnits, type Address } from "viem";
import { useAccount } from "wagmi";
import { escrowAbi, nftAbi } from "@/abi";
import NotDeployed from "@/components/NotDeployed";
import TxButton from "@/components/TxButton";
import { baseSepolia, buyerChains, CANONICAL_CHAIN } from "@/lib/chains";
import { deployment, isDeployed, TOKEN_DECIMALS } from "@/lib/config";

const toUnits = (v: string) => {
  try {
    return parseUnits(v || "0", TOKEN_DECIMALS);
  } catch {
    return 0n;
  }
};

export default function Sell() {
  const { address } = useAccount();
  const [nft, setNft] = useState<string>(deployment.nft ?? "");
  const [tokenId, setTokenId] = useState("");
  const [duration, setDuration] = useState("300");
  const [startPrice, setStartPrice] = useState("1000");
  const [reservePrice, setReservePrice] = useState("500");
  const [decrement, setDecrement] = useState("50");
  const [interval, setInterval] = useState("10");
  const [payouts, setPayouts] = useState<Record<number, string>>({});
  const [created, setCreated] = useState<`0x${string}`>();

  if (!isDeployed) return <NotDeployed />;

  const payoutFor = (chainId: number) => payouts[chainId] ?? address ?? "";
  const start = toUnits(startPrice);
  const reserve = toUnits(reservePrice);
  const dec = toUnits(decrement);
  const valid =
    isAddress(nft) &&
    tokenId !== "" &&
    Number(duration) > 0 &&
    Number(interval) > 0 &&
    reserve > 0n &&
    start >= reserve &&
    dec > 0n &&
    buyerChains.every((c) => isAddress(payoutFor(c.id)));

  return (
    <>
      <h1>Create an auction</h1>
      <p className="small">
        Your NFT is held in the {CANONICAL_CHAIN.name} escrow until it is sold or you reclaim it after expiry. Buyers on every
        enabled chain compete for it.
      </p>

      <div className="card">
        <h2>1. NFT</h2>
        <label>NFT contract</label>
        <input value={nft} onChange={(e) => setNft(e.target.value)} placeholder="0x…" />
        <label>Token ID</label>
        <input value={tokenId} onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
        {deployment.nft && nft.toLowerCase() === deployment.nft.toLowerCase() && (
          <TxButton
            chainId={baseSepolia.id}
            label="Mint a demo NFT"
            request={() => ({ address: deployment.nft!, abi: nftAbi, functionName: "mint", chainId: baseSepolia.id })}
            onDone={(r) => {
              const t = parseEventLogs({ abi: nftAbi, logs: r.logs, eventName: "Transfer" })[0];
              if (t) setTokenId(t.args.tokenId.toString());
            }}
          />
        )}
      </div>

      <div className="card">
        <h2>2. Price curve (bUSD)</h2>
        <div className="grid">
          <div>
            <label>Start price</label>
            <input value={startPrice} onChange={(e) => setStartPrice(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label>Reserve price</label>
            <input value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label>Drops by</label>
            <input value={decrement} onChange={(e) => setDecrement(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label>Every (seconds)</label>
            <input value={interval} onChange={(e) => setInterval(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
          </div>
          <div>
            <label>Duration (seconds)</label>
            <input value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
          </div>
        </div>
        {start < reserve && <p className="err small">Start price must be at least the reserve price.</p>}
      </div>

      <div className="card">
        <h2>3. Where you get paid</h2>
        <p className="small">
          You are paid on the chain the winner bid from, in that chain&apos;s bUSD. Use an address you control on each chain. Plain
          wallet addresses work everywhere; smart-contract wallets often have a different address per chain, so avoid them here.
        </p>
        {buyerChains.map((c) => (
          <div key={c.id}>
            <label>Payout address on {c.name}</label>
            <input
              value={payoutFor(c.id)}
              onChange={(e) => setPayouts({ ...payouts, [c.id]: e.target.value })}
              placeholder="0x…"
            />
          </div>
        ))}
      </div>

      <div className="card">
        <h2>4. Approve and create</h2>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <TxButton
            chainId={CANONICAL_CHAIN.id}
            label="Approve escrow"
            disabled={!valid}
            request={() => ({
              address: nft as Address,
              abi: nftAbi,
              functionName: "approve",
              args: [deployment.escrow!, BigInt(tokenId)],
              chainId: CANONICAL_CHAIN.id,
            })}
          />
          <TxButton
            chainId={CANONICAL_CHAIN.id}
            label="Create campaign"
            disabled={!valid}
            request={() => ({
              address: deployment.escrow!,
              abi: escrowAbi,
              functionName: "createCampaign",
              args: [
                {
                  nft: nft as Address,
                  tokenId: BigInt(tokenId),
                  duration: BigInt(duration),
                  startPrice: start,
                  reservePrice: reserve,
                  decrement: dec,
                  interval: BigInt(interval),
                },
                buyerChains.map((c) => BigInt(c.id)),
                buyerChains.map((c) => payoutFor(c.id) as Address),
                buyerChains.map((c) => deployment.token[c.id]!),
              ],
              chainId: CANONICAL_CHAIN.id,
            })}
            onDone={(r) => {
              const ev = parseEventLogs({ abi: escrowAbi, logs: r.logs, eventName: "CampaignCreated" })[0];
              if (ev) setCreated(ev.args.campaignId);
            }}
          />
        </div>
        {created && (
          <p className="ok">
            Campaign created. <Link href={`/campaign/${created}`}>Open it →</Link>
          </p>
        )}
      </div>
    </>
  );
}
