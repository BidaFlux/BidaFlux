import type { Step } from "@/lib/bidSteps";

/** Four-step tracker for the buyer flow. Purely presentational: the status of each step is computed by bidSteps. */
export default function BidProgress({ steps }: { steps: Step[] }) {
  return (
    <ol className="steps" aria-label="Your progress">
      {steps.map((s, n) => (
        <li key={s.key} className={`step ${s.status}`} aria-current={s.status === "current" ? "step" : undefined}>
          <span className="dot">{s.status === "done" ? "✓" : n + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}
