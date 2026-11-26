import type { PriceCurve as Curve } from "@/lib/price";
import { curvePoints, priceAt, reserveReachedAt } from "@/lib/price";
import { fmtToken } from "@/lib/format";

const W = 560;
const H = 200;
const PAD = { l: 8, r: 8, t: 22, b: 26 };

/** The auction's price over time, drawn from the same integer formula the escrow uses. The dot is the current time. */
export default function PriceCurve({ curve, duration, now, showNow }: { curve: Curve; duration: number; now: bigint; showNow: boolean }) {
  const pts = curvePoints(curve, duration);
  const range = Number(curve.startPrice - curve.reservePrice) || 1;
  const x = (t: number) => PAD.l + (t / duration) * (W - PAD.l - PAD.r);
  const y = (p: bigint) => PAD.t + (1 - Number(p - curve.reservePrice) / range) * (H - PAD.t - PAD.b);
  const elapsed = Math.min(Math.max(Number(now - curve.start), 0), duration);
  const nowPrice = priceAt(curve, curve.start + BigInt(elapsed));
  const reachAt = reserveReachedAt(curve);

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Price falls from ${fmtToken(curve.startPrice)} to ${fmtToken(curve.reservePrice)} bUSD`}>
        <polyline fill="none" stroke="var(--violet)" strokeWidth="2" points={pts.map((q) => `${x(q.t).toFixed(1)},${y(q.p).toFixed(1)}`).join(" ")} />
        {showNow && <circle cx={x(elapsed)} cy={y(nowPrice)} r="5" fill="var(--warn)" />}
        <g fill="var(--muted)" fontSize="11">
          <text x={PAD.l} y="12">{fmtToken(curve.startPrice)} bUSD</text>
          <text x={PAD.l} y={H - 8}>{fmtToken(curve.reservePrice)} bUSD floor · 0s</text>
          <text x={W - PAD.r} y={H - 8} textAnchor="end">{duration}s</text>
        </g>
      </svg>
      <figcaption className="small">
        {reachAt < duration ? `Reaches the reserve at ${reachAt}s, then stays flat.` : "Does not reach the reserve before the auction ends."} Drawn from the
        contract formula{showNow ? "; the dot is the current time." : "."}
      </figcaption>
    </figure>
  );
}
