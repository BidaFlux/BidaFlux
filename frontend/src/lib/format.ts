import { formatUnits } from "viem";
import { TOKEN_DECIMALS } from "./config";

export const fmtToken = (v: bigint) => formatUnits(v, TOKEN_DECIMALS);
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
export const fmtTime = (ts: bigint | number) => new Date(Number(ts) * 1000).toLocaleString();

export function fmtDuration(seconds: number) {
  if (seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function errMessage(e: unknown) {
  const err = e as { shortMessage?: string; message?: string };
  return err.shortMessage ?? err.message ?? "Unknown error";
}
