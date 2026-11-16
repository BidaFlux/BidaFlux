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
