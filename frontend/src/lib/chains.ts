import { defineChain } from "viem";
import { baseSepolia, unichainSepolia } from "viem/chains";

export { baseSepolia, unichainSepolia };

export const lasna = defineChain({
  id: 5318007,
  name: "Reactive Lasna",
  nativeCurrency: { name: "lREACT", symbol: "lREACT", decimals: 18 },
  rpcUrls: { default: { http: ["https://lasna-rpc.rnk.dev/"] } },
  blockExplorers: { default: { name: "Reactscan", url: "https://lasna.reactscan.net" } },
});

/** Chains a buyer can bid from. Base Sepolia is also where the NFT escrow lives. */
export const buyerChains = [baseSepolia, unichainSepolia] as const;
export const CANONICAL_CHAIN = baseSepolia;

export function chainById(id: number) {
  return [baseSepolia, unichainSepolia, lasna].find((c) => c.id === id);
}

export function explorerUrl(chainId: number) {
  return chainById(chainId)?.blockExplorers?.default.url ?? "";
}

export const txUrl = (chainId: number, hash: string) => `${explorerUrl(chainId)}/tx/${hash}`;
export const addressUrl = (chainId: number, address: string) => `${explorerUrl(chainId)}/address/${address}`;
