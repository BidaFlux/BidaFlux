"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isAddress, parseEventLogs, parseUnits, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { escrowAbi, nftAbi } from "@/abi";
import NotDeployed from "@/components/NotDeployed";
import TxButton from "@/components/TxButton";
import TxLink from "@/components/TxLink";
import { baseSepolia, buyerChains, CANONICAL_CHAIN } from "@/lib/chains";
import { deployment, isDeployed, TOKEN_DECIMALS } from "@/lib/config";
import { fmtDuration, fmtToken } from "@/lib/format";

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
  const [manualId, setManualId] = useState(false);
  const [duration, setDuration] = useState("300");
  const [startPrice, setStartPrice] = useState("1000");
  const [reservePrice, setReservePrice] = useState("500");
  const [decrement, setDecrement] = useState("50");
  const [interval, setInterval] = useState("10");
  const [payouts, setPayouts] = useState<Record<number, string>>({});
  const [created, setCreated] = useState<{
    id: `0x${string}`;
    tx: `0x${string}`;
    tokenId: string;
    start: bigint;
    reserve: bigint;
    decrement: bigint;
    interval: string;
    duration: string;
    chains: string[];
  }>();

  // ownerOf reverts for a token that does not exist, which the query reports as an error: treat that as "not owned".
  const idReady = isAddress(nft) && tokenId !== "";
  const owner = useReadContract({
    address: isAddress(nft) ? nft : undefined,
    abi: nftAbi,
    functionName: "ownerOf",
    args: [idReady ? BigInt(tokenId) : 0n],
    chainId: baseSepolia.id,
    query: { enabled: idReady, refetchInterval: 4000 },
  });
  const ownsToken = !!address && owner.data?.toLowerCase() === address.toLowerCase();

  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (created) summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [created]);

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
  const ready = valid && ownsToken;
  const ownershipHint = !idReady
    ? "Mint a demo NFT above (or enter the ID of one you own)."
    : owner.isLoading
      ? "Checking who owns this token…"
      : owner.error
        ? "This token does not exist yet. Mint one first."
        : !ownsToken
          ? "The connected wallet does not own this token."
          : "";

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
        <input
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          readOnly={!manualId}
          placeholder={manualId ? "ID of an NFT you own" : "Filled in automatically when you mint"}
        />
        <label className="small">
          <input type="checkbox" checked={manualId} onChange={(e) => setManualId(e.target.checked)} /> I already own an NFT,
          let me enter its ID
        </label>
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
        <p className="small">
          Two transactions, in this order. <b>Approve escrow</b> gives the escrow contract permission to take this one NFT from you;
          nothing moves yet. <b>Create campaign</b> then moves the NFT into escrow and starts the auction with the settings above.
        </p>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <TxButton
            chainId={CANONICAL_CHAIN.id}
            label="Approve escrow"
            disabled={!ready}
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
            disabled={!ready}
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
              if (ev)
                setCreated({
                  id: ev.args.campaignId,
                  tx: r.transactionHash,
                  tokenId,
                  start,
                  reserve,
                  decrement: dec,
                  interval,
                  duration,
                  chains: buyerChains.map((c) => c.name),
                });
            }}
          />
        </div>
        {!ready && ownershipHint && <p className="small err">{ownershipHint}</p>}
        {created && (
          <div ref={summaryRef} className="card" style={{ marginTop: 16, marginBottom: 0 }}>
            <h2 className="ok">Auction created</h2>
            <table>
              <tbody>
                <tr><th>NFT</th><td>#{created.tokenId}</td></tr>
                <tr><th>Starts at</th><td>{fmtToken(created.start)} bUSD</td></tr>
                <tr><th>Lowest price</th><td>{fmtToken(created.reserve)} bUSD (drops {fmtToken(created.decrement)} every {created.interval}s)</td></tr>
                <tr><th>Runs for</th><td>{fmtDuration(Number(created.duration))}</td></tr>
                <tr><th>Buyers from</th><td>{created.chains.join(", ")}</td></tr>
                <tr><th>Transaction</th><td><TxLink chainId={CANONICAL_CHAIN.id} hash={created.tx} /></td></tr>
              </tbody>
            </table>
            <p style={{ marginTop: 12 }}>
              <Link href={`/campaign/${created.id}`}>View your auction →</Link>
            </p>
          </div>
        )}
      </div>
    </>
  );
}
