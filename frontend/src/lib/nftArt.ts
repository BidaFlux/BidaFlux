/** Resolving an NFT's image from tokenURI. Pure helpers; the fetch lives in the component. */
const GATEWAY = "https://ipfs.io/ipfs/";

export function resolveUri(uri: string): string | undefined {
  const u = uri.trim();
  if (!u) return undefined;
  if (u.startsWith("ipfs://ipfs/")) return GATEWAY + u.slice("ipfs://ipfs/".length);
  if (u.startsWith("ipfs://")) return GATEWAY + u.slice("ipfs://".length);
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
  return undefined;
}

/** Decodes a data: URI holding JSON (base64 or percent-encoded). Undefined when it is not valid JSON. */
export function parseDataJson(uri: string): Record<string, unknown> | undefined {
  const m = /^data:([^,]*?),(.*)$/s.exec(uri);
  if (!m) return undefined;
  try {
    const body = m[1].includes("base64") ? new TextDecoder().decode(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))) : decodeURIComponent(m[2]);
    const j = JSON.parse(body);
    return j && typeof j === "object" ? j : undefined;
  } catch {
    return undefined;
  }
}

/** Deterministic colours from a token id, so the same NFT always looks the same. */
export function gradientFor(tokenId: bigint): string {
  const h = Number((tokenId * 47n + 211n) % 360n);
  return `linear-gradient(135deg, hsl(${h}, 80%, 45%), hsl(${(h + 70) % 360}, 85%, 30%))`;
}
