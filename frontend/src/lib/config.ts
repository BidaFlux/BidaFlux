import type { Address } from "viem";
import { baseSepolia, unichainSepolia } from "./chains";

const addr = (v: string | undefined) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);
const block = (v: string | undefined) => (v && /^\d+$/.test(v) ? BigInt(v) : undefined);

// Next.js only inlines NEXT_PUBLIC_* when referenced literally, so each is spelled out.
export const deployment = {
  escrow: addr(process.env.NEXT_PUBLIC_ESCROW),
  nft: addr(process.env.NEXT_PUBLIC_NFT),
  coordinator: addr(process.env.NEXT_PUBLIC_COORDINATOR),
  vault: {
    [baseSepolia.id]: addr(process.env.NEXT_PUBLIC_VAULT_BASE),
    [unichainSepolia.id]: addr(process.env.NEXT_PUBLIC_VAULT_UNI),
  } as Record<number, Address | undefined>,
  token: {
    [baseSepolia.id]: addr(process.env.NEXT_PUBLIC_TOKEN_BASE),
    [unichainSepolia.id]: addr(process.env.NEXT_PUBLIC_TOKEN_UNI),
  } as Record<number, Address | undefined>,
  fromBlock: {
    [baseSepolia.id]: block(process.env.NEXT_PUBLIC_BASE_FROM_BLOCK),
    [unichainSepolia.id]: block(process.env.NEXT_PUBLIC_UNI_FROM_BLOCK),
  } as Record<number, bigint | undefined>,
  rpc: {
    [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_RPC || "https://base-sepolia-rpc.publicnode.com",
    [unichainSepolia.id]: process.env.NEXT_PUBLIC_UNI_RPC || "https://unichain-sepolia-rpc.publicnode.com",
  } as Record<number, string>,
};

/** True once every address the UI needs has been configured. */
export const isDeployed = Boolean(
  deployment.escrow &&
    deployment.vault[baseSepolia.id] &&
    deployment.vault[unichainSepolia.id] &&
    deployment.token[baseSepolia.id] &&
    deployment.token[unichainSepolia.id],
);

export const TOKEN_DECIMALS = 6;
export const GRACE_SECONDS = 120;
