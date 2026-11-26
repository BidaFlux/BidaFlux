import type { Campaign } from "@/lib/campaign";
import { CANONICAL_CHAIN, chainById } from "@/lib/chains";
import { shortAddr } from "@/lib/format";
import { settlementSummary, type Intent } from "@/lib/intents";
import Price from "./Price";
import TxLink from "./TxLink";

/** Shown once the escrow has settled. Seller payout and loser unlocks are separate on-chain events, so they are shown separately. */
export default function SettlementPanel({ campaign: c, intents }: { campaign: Campaign; intents: Intent[] }) {
  const s = settlementSummary(intents, c.winnerIntent);
  const chain = chainById(Number(c.winnerChainId))?.name ?? `chain ${c.winnerChainId}`;
  return (
    <div className="strip strip-sold">
      <b>Auction completed</b>
      <dl className="kv" style={{ marginTop: 8 }}>
        <dt>Winner</dt>
        <dd className="mono">{shortAddr(c.winner)}</dd>
        <dt>Source chain</dt>
        <dd>{chain}</dd>
        <dt>Final price</dt>
        <dd><Price value={c.price} className="" /></dd>
        <dt>NFT settlement tx</dt>
        <dd>{s.winner?.decision ? <TxLink chainId={CANONICAL_CHAIN.id} hash={s.winner.decision.txHash} /> : <span className="small">Not found in the event log</span>}</dd>
        <dt>Seller payout</dt>
        <dd>
          {s.sellerPaid && s.winner?.vault ? (
            <span className="ok">Paid · <TxLink chainId={s.winner.vault.chainId} hash={s.winner.vault.txHash} /></span>
          ) : (
            <span className="warn-text">Not yet confirmed on {chain}</span>
          )}
        </dd>
        <dt>Other bidders</dt>
        <dd>
          {s.losers.total === 0
            ? "None"
            : `${s.losers.unlocked} of ${s.losers.total} unlocked${s.losers.pending ? `, ${s.losers.pending} still processing` : ""}`}
        </dd>
      </dl>
    </div>
  );
}
