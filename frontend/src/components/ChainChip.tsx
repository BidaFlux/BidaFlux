import { baseSepolia, chainById, unichainSepolia } from "@/lib/chains";

const DOT: Record<number, string> = { [baseSepolia.id]: "base", [unichainSepolia.id]: "uni" };

export function ChainChip({ chainId }: { chainId: number }) {
  return (
    <span className="chip">
      <i className={`dot ${DOT[chainId] ?? ""}`} aria-hidden="true" />
      {chainById(chainId)?.name ?? `Chain ${chainId}`}
    </span>
  );
}

export function ChainChips({ chainIds }: { chainIds: number[] }) {
  return (
    <span>
      {chainIds.map((id) => (
        <ChainChip key={id} chainId={id} />
      ))}
    </span>
  );
}
