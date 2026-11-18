"use client";

import { fmtDuration } from "@/lib/format";
import { useNow } from "@/lib/useNow";

/** Time left until `expiry` (unix seconds), counted from the wall clock. */
export default function Countdown({ expiry }: { expiry: bigint }) {
  const left = Number(expiry - useNow());
  return <span>{left > 0 ? `${fmtDuration(left)} left` : "Ended"}</span>;
}
