"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { nftAbi } from "@/abi";
import { CANONICAL_CHAIN } from "@/lib/chains";
import { publicClientFor } from "@/lib/logs";
import { gradientFor, parseDataJson, resolveUri } from "@/lib/nftArt";

/** Resolves to null (not undefined: React Query rejects undefined) when the NFT has no usable image. */
async function fetchImage(nft: Address, tokenId: bigint): Promise<string | null> {
  const raw = await publicClientFor(CANONICAL_CHAIN.id).readContract({ address: nft, abi: nftAbi, functionName: "tokenURI", args: [tokenId] });
  const uri = resolveUri(raw);
  if (!uri) return null;
  let meta: Record<string, unknown> | undefined;
  if (uri.startsWith("data:")) meta = parseDataJson(uri);
  else {
    const res = await fetch(uri);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) return uri;
    meta = await res.json();
  }
  return (typeof meta?.image === "string" && resolveUri(meta.image)) || null;
}

/** The NFT's own image when tokenURI gives one; otherwise a gradient from the token id, labelled "NFT #id". */
export default function NftArt({ nft, tokenId, children, className = "" }: { nft: Address; tokenId: bigint; children?: ReactNode; className?: string }) {
  const { data: image } = useQuery({
    queryKey: ["nft-image", nft, tokenId.toString()],
    queryFn: () => fetchImage(nft, tokenId).catch(() => null),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <div
      className={`art ${className}`}
      style={image ? { backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: gradientFor(tokenId) }}
      role="img"
      aria-label={`NFT #${tokenId}`}
    >
      {!image && <span className="art-label">NFT #{tokenId.toString()}</span>}
      {children}
    </div>
  );
}
