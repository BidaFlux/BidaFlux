import { txUrl } from "@/lib/chains";
import { shortHash } from "@/lib/format";

export default function TxLink({ chainId, hash }: { chainId: number; hash: string }) {
  return (
    <a className="mono" href={txUrl(chainId, hash)} target="_blank" rel="noreferrer" aria-label={`Transaction ${hash}, opens the block explorer`}>
      {shortHash(hash)} ↗
    </a>
  );
}
