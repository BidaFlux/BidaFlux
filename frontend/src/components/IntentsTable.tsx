import { chainById } from "@/lib/chains";
import { REJECT_REASONS } from "@/lib/activity";
import { fmtToken, shortAddr } from "@/lib/format";
import type { Intent } from "@/lib/intents";
import { pendingLabel } from "@/lib/status";
import TxLink from "./TxLink";

function outcome(i: Intent, now: bigint) {
  if (!i.decision) {
    return <span className="warn-text">Processing · {pendingLabel(Number(now - i.intentTs))}</span>;
  }
  const vault = i.vault ? (i.vault.kind === "paid" ? " · seller paid" : " · unlocked") : " · vault update pending";
  return i.decision.kind === "settled" ? (
    <span className="badge badge-sold">Won</span>
  ) : (
    <span>
      Rejected ({REJECT_REASONS[i.decision.reason ?? 0] ?? "unknown reason"}){vault}
    </span>
  );
}

/** Intents for one campaign, newest first. Amounts and statuses come only from emitted events. */
export default function IntentsTable({ intents, now }: { intents: Intent[]; now: bigint }) {
  if (!intents.length) return <p className="small">No purchase intents yet.</p>;
  const sorted = [...intents].sort((a, b) => Number(b.intentTs - a.intentTs));
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Buyer</th>
            <th>From</th>
            <th>Locked</th>
            <th>Status</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((i) => (
            <tr key={i.intentId}>
              <td className="mono">{shortAddr(i.buyer)}</td>
              <td>{chainById(i.source.chainId)?.name}</td>
              <td>{fmtToken(i.lockAmount)} bUSD</td>
              <td>{outcome(i, now)}</td>
              <td>
                <TxLink chainId={i.source.chainId} hash={i.source.txHash} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
