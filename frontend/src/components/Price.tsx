import { fmtToken } from "@/lib/format";

/** An amount in bUSD base units. Always labelled "bUSD", never "$". */
export default function Price({ value, className = "price" }: { value: bigint; className?: string }) {
  return (
    <span className={className}>
      {fmtToken(value)}
      <span className="unit">bUSD</span>
    </span>
  );
}
