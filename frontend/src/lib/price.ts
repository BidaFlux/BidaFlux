/** Mirrors AuctionEscrow.priceAt: max(reserve, start - decrement * floor((t - start) / interval)), integer math. */
export interface PriceCurve {
  start: bigint;
  startPrice: bigint;
  reservePrice: bigint;
  decrement: bigint;
  interval: bigint;
}

export function priceAt(c: PriceCurve, t: bigint): bigint {
  if (t <= c.start) return c.startPrice;
  const steps = (t - c.start) / c.interval;
  const range = c.startPrice - c.reservePrice;
  if (steps >= (range + c.decrement - 1n) / c.decrement) return c.reservePrice;
  return c.startPrice - steps * c.decrement;
}

export interface CurvePoint {
  /** Seconds since the campaign started. */
  t: number;
  p: bigint;
}

/** Seconds from the start until the price first reaches the reserve. */
export function reserveReachedAt(c: PriceCurve): number {
  const range = c.startPrice - c.reservePrice;
  return Number(((range + c.decrement - 1n) / c.decrement) * c.interval);
}

/**
 * The price curve as a staircase, taken from priceAt itself. Past the reserve it stays flat until `duration`.
 * Very long curves are sampled every few steps so the drawing stays small.
 */
export function curvePoints(c: PriceCurve, duration: number): CurvePoint[] {
  const interval = Number(c.interval);
  const end = Math.min(duration, reserveReachedAt(c));
  const stride = Math.max(1, Math.ceil(end / interval / 1500));
  const pts: CurvePoint[] = [{ t: 0, p: c.startPrice }];
  let last = c.startPrice;
  for (let t = interval * stride; t < end; t += interval * stride) {
    const p = priceAt(c, c.start + BigInt(t));
    pts.push({ t, p: last }, { t, p });
    last = p;
  }
  if (end < duration) {
    const p = priceAt(c, c.start + BigInt(end));
    pts.push({ t: end, p: last }, { t: end, p });
    last = p;
  }
  pts.push({ t: duration, p: end >= duration ? priceAt(c, c.start + BigInt(duration)) : last });
  return pts;
}
