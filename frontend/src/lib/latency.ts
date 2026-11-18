export interface LatencySummary {
  /** Mean of whole-second block-timestamp differences, rounded to whole seconds. */
  avg: number;
  n: number;
}

/** Undefined while nothing has been measured, so the UI can say "Not measured yet". Negative differences are clock skew, not data. */
export function summarize(seconds: (number | undefined)[]): LatencySummary | undefined {
  const xs = seconds.filter((s): s is number => s !== undefined && s >= 0);
  return xs.length ? { avg: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), n: xs.length } : undefined;
}

export const fmtLatency = (s?: LatencySummary) => (s ? `avg ${s.avg}s (n=${s.n})` : "Not measured yet");
