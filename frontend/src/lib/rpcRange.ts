export const MIN_CHUNK = 100n;

/**
 * Public RPCs cap eth_getLogs ranges and say so in free text ("limited to a 200 range", "block range greater than 1000
 * max", "exceed maximum block range: 50000"). Returns the next range to try after such an error, or undefined if the
 * error is about something else or the range is already as small as we go.
 */
/** HTTP 429 or "rate limit" text: the request was fine, the provider is just busy. Retry later with the same range. */
export function isRateLimited(message: string): boolean {
  return /\b429\b|rate limit|too many requests/i.test(message);
}

export function nextChunk(message: string, current: bigint): bigint | undefined {
  if (isRateLimited(message)) return undefined;
  if (!/range|limit|exceed|too many|more than|max/i.test(message)) return undefined;
  const numbers = (message.match(/\d[\d,]*/g) ?? []).map((n) => BigInt(n.replace(/,/g, ""))).filter((n) => n >= MIN_CHUNK && n < current);
  const hinted = numbers.length ? numbers.reduce((a, b) => (a > b ? a : b)) : undefined;
  const next = hinted ?? current / 2n;
  return next < MIN_CHUNK ? undefined : next;
}
