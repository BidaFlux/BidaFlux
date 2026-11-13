import { createPublicClient, getAbiItem, http, type Abi, type Address, type PublicClient } from "viem";
import { chainById } from "./chains";
import { deployment } from "./config";

const clients = new Map<number, PublicClient>();

/** Read-only client for a chain, using the configured RPC. Cached per chain. */
export function publicClientFor(chainId: number): PublicClient {
  let c = clients.get(chainId);
  if (!c) {
    const chain = chainById(chainId);
    if (!chain) throw new Error(`Unsupported chain ${chainId}`);
    c = createPublicClient({ chain, transport: http(deployment.rpc[chainId] ?? chain.rpcUrls.default.http[0]) }) as PublicClient;
    clients.set(chainId, c);
  }
  return c;
}

export interface DecodedLog {
  chainId: number;
  txHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  args: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const CHUNK = 9_000n; // public RPCs cap eth_getLogs ranges
const MAX_CHUNKS = 400;

/**
 * Fetches an event's logs from `fromBlock` (the deployment block) to the chain head, in chunks.
 * Without a configured deployment block it only looks at the most recent chunk rather than guessing.
 */
export async function getEventLogs(opts: {
  chainId: number;
  address: Address;
  abi: Abi;
  eventName: string;
  args?: Record<string, unknown>;
}): Promise<DecodedLog[]> {
  const client = publicClientFor(opts.chainId);
  const event = getAbiItem({ abi: opts.abi, name: opts.eventName });
  if (!event || event.type !== "event") throw new Error(`No event ${opts.eventName}`);

  const head = await client.getBlockNumber();
  let from = deployment.fromBlock[opts.chainId] ?? (head > CHUNK ? head - CHUNK : 0n);
  const out: DecodedLog[] = [];
  for (let i = 0; from <= head && i < MAX_CHUNKS; i++) {
    const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
    const logs = await client.getLogs({ address: opts.address, event, args: opts.args as never, fromBlock: from, toBlock: to });
    for (const l of logs) {
      out.push({
        chainId: opts.chainId,
        txHash: l.transactionHash,
        blockNumber: l.blockNumber,
        logIndex: l.logIndex,
        args: (l as unknown as { args: Record<string, unknown> }).args,
      });
    }
    from = to + 1n;
  }
  return out;
}

const blockTimes = new Map<string, bigint>();

/** Block timestamp in seconds, cached. */
export async function blockTimestamp(chainId: number, blockNumber: bigint): Promise<bigint> {
  const key = `${chainId}:${blockNumber}`;
  const hit = blockTimes.get(key);
  if (hit !== undefined) return hit;
  const block = await publicClientFor(chainId).getBlock({ blockNumber });
  blockTimes.set(key, block.timestamp);
  return block.timestamp;
}
