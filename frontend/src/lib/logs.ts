import { createPublicClient, getAbiItem, http, type Abi, type Address, type PublicClient } from "viem";
import { chainById } from "./chains";
import { deployment } from "./config";
import { isRateLimited, nextChunk } from "./rpcRange";

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

const START_CHUNK = 50_000n;
const MAX_RETRIES = 6;
const MAX_WINDOWS = 5_000;

/** Largest range each RPC has accepted so far, learned from its own error messages. */
const learnedChunk = new Map<number, bigint>();

interface Scan {
  next: bigint;
  logs: DecodedLog[];
}
const scans = new Map<string, Scan>();
const queues = new Map<string, Promise<unknown>>();

/**
 * Fetches an event's logs from the deployment block to the chain head, in windows sized to what the RPC accepts.
 * Results are cached per query, so later calls only scan blocks added since the last one.
 * Without a configured deployment block it only looks at the most recent window rather than guessing.
 */
export interface LogQuery {
  chainId: number;
  address: Address;
  abi: Abi;
  eventName: string;
  args?: Record<string, unknown>;
}

export function getEventLogs(opts: LogQuery): Promise<DecodedLog[]> {
  const key = [opts.chainId, opts.address, opts.eventName, JSON.stringify(opts.args ?? {}, (_, v) => (typeof v === "bigint" ? v.toString() : v))].join(":");
  // Calls with the same key run one after another so they never scan the same blocks twice.
  const run = (queues.get(key) ?? Promise.resolve()).then(() => scan(key, opts));
  queues.set(key, run.catch(() => undefined));
  return run;
}

async function scan(key: string, opts: LogQuery): Promise<DecodedLog[]> {
  const client = publicClientFor(opts.chainId);
  const event = getAbiItem({ abi: opts.abi, name: opts.eventName });
  if (!event || event.type !== "event") throw new Error(`No event ${opts.eventName}`);
  return windowedScan(key, opts.chainId, async (from, to) => {
    const logs = await client.getLogs({ address: opts.address, event, args: opts.args as never, fromBlock: from, toBlock: to });
    return logs.map((l) => ({
      chainId: opts.chainId,
      txHash: l.transactionHash,
      blockNumber: l.blockNumber,
      logIndex: l.logIndex,
      args: (l as unknown as { args: Record<string, unknown> }).args,
    }));
  });
}

/** Raw topic query (for events that are not in any ABI we ship). `args` holds `topics` and `data` as hex. */
export function getRawLogs(opts: { chainId: number; address: Address; topics: (string | string[] | null)[] }): Promise<DecodedLog[]> {
  const key = ["raw", opts.chainId, opts.address, JSON.stringify(opts.topics)].join(":");
  const run = (queues.get(key) ?? Promise.resolve()).then(() =>
    windowedScan(key, opts.chainId, async (from, to) => {
      const logs = (await publicClientFor(opts.chainId).request({
        method: "eth_getLogs",
        params: [{ address: opts.address, topics: opts.topics as never, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
      })) as { transactionHash: `0x${string}`; blockNumber: `0x${string}`; logIndex: `0x${string}`; topics: string[]; data: string }[];
      return logs.map((l) => ({
        chainId: opts.chainId,
        txHash: l.transactionHash,
        blockNumber: BigInt(l.blockNumber),
        logIndex: Number(l.logIndex),
        args: { topics: l.topics, data: l.data },
      }));
    }),
  );
  queues.set(key, run.catch(() => undefined));
  return run;
}

async function windowedScan(key: string, chainId: number, fetchWindow: (from: bigint, to: bigint) => Promise<DecodedLog[]>): Promise<DecodedLog[]> {
  const client = publicClientFor(chainId);
  const opts = { chainId };

  const head = await client.getBlockNumber();
  const prior = scans.get(key);
  let chunk = learnedChunk.get(opts.chainId) ?? START_CHUNK;
  let from = prior?.next ?? deployment.fromBlock[opts.chainId] ?? (head > chunk ? head - chunk : 0n);
  const found: DecodedLog[] = [];
  let retries = 0;
  for (let i = 0; from <= head; i++) {
    if (i >= MAX_WINDOWS) throw new Error("Too many log windows; set a higher-limit RPC for this chain.");
    const to = from + chunk - 1n > head ? head : from + chunk - 1n;
    try {
      found.push(...(await fetchWindow(from, to)));
      from = to + 1n;
      retries = 0;
    } catch (e) {
      const err = e as { message?: string; details?: string; shortMessage?: string };
      const text = `${err.shortMessage ?? ""} ${err.details ?? ""} ${err.message ?? ""}`;
      if (isRateLimited(text) && retries < MAX_RETRIES) {
        // Back off and retry the same window: 0.5s, 1s, 2s, ...
        await new Promise((r) => setTimeout(r, 500 * 2 ** retries++));
        continue;
      }
      const smaller = nextChunk(text, chunk);
      if (smaller === undefined) throw e;
      chunk = smaller;
      learnedChunk.set(opts.chainId, chunk);
    }
  }
  const all = [...(prior?.logs ?? []), ...found];
  scans.set(key, { next: head + 1n, logs: all });
  return [...all];
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
