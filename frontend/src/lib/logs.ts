import { createPublicClient, getAbiItem, http, parseEventLogs, type Abi, type Address, type PublicClient } from "viem";
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
const CONCURRENCY = 3;
const MAX_WINDOWS = 5_000;

/** Largest range each RPC has accepted so far, learned from its own error messages. */
const learnedChunk = new Map<number, bigint>();

interface Scan<T> {
  next: bigint;
  items: T[];
}
const scans = new Map<string, Scan<unknown>>();
const queues = new Map<string, Promise<unknown>>();

export interface LogQuery {
  chainId: number;
  address: Address;
  abi: Abi;
  eventName: string;
  args?: Record<string, unknown>;
}

/** Runs scans that share a key one after another, so they never fetch the same blocks twice. */
function queued<T>(key: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(job);
  queues.set(key, run.catch(() => undefined));
  return run;
}

type RawLog = Awaited<ReturnType<PublicClient["getLogs"]>>[number];

/** Every log a contract has emitted since its deployment block. One scan per contract, however many events are read from it. */
function contractLogs(chainId: number, address: Address): Promise<RawLog[]> {
  const key = `contract:${chainId}:${address}`;
  return queued(key, () =>
    windowedScan<RawLog>(key, chainId, (from, to) => publicClientFor(chainId).getLogs({ address, fromBlock: from, toBlock: to }) as Promise<RawLog[]>),
  );
}

/**
 * One event's logs for a contract, from its deployment block to the chain head. The contract is scanned once, in windows sized
 * to what the RPC accepts, and cached, so reading more events from it costs nothing and later calls only scan new blocks.
 * Without a configured deployment block it only looks at the most recent window rather than guessing.
 */
export async function getEventLogs(opts: LogQuery): Promise<DecodedLog[]> {
  const event = getAbiItem({ abi: opts.abi, name: opts.eventName });
  if (!event || event.type !== "event") throw new Error(`No event ${opts.eventName}`);
  const raw = await contractLogs(opts.chainId, opts.address);
  const parsed = parseEventLogs({ abi: opts.abi, eventName: opts.eventName as never, args: opts.args as never, logs: raw as never, strict: false });
  return (parsed as unknown as { transactionHash: `0x${string}`; blockNumber: bigint; logIndex: number; args: Record<string, unknown> }[]).map((l) => ({
    chainId: opts.chainId,
    txHash: l.transactionHash,
    blockNumber: l.blockNumber,
    logIndex: l.logIndex,
    args: l.args,
  }));
}

/** Raw topic query (for events that are not in any ABI we ship). `args` holds `topics` and `data` as hex. */
export function getRawLogs(opts: { chainId: number; address: Address; topics: (string | string[] | null)[] }): Promise<DecodedLog[]> {
  const key = ["raw", opts.chainId, opts.address, JSON.stringify(opts.topics)].join(":");
  return queued(key, () =>
    windowedScan<DecodedLog>(key, opts.chainId, async (from, to) => {
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
}

async function windowedScan<T>(key: string, chainId: number, fetchWindow: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> {
  const client = publicClientFor(chainId);
  const head = await client.getBlockNumber();
  const prior = scans.get(key) as Scan<T> | undefined;
  let chunk = learnedChunk.get(chainId) ?? START_CHUNK;
  let from = prior?.next ?? deployment.fromBlock[chainId] ?? (head > chunk ? head - chunk : 0n);
  const found: T[] = [];
  let retries = 0;
  // Windows are independent, so a few are fetched at once; the results are only kept when the whole batch succeeds.
  for (let i = 0; from <= head; i += CONCURRENCY) {
    if (i >= MAX_WINDOWS) throw new Error("Too many log windows; set a higher-limit RPC for this chain.");
    const windows: [bigint, bigint][] = [];
    for (let f = from; f <= head && windows.length < CONCURRENCY; f += chunk) windows.push([f, f + chunk - 1n > head ? head : f + chunk - 1n]);
    try {
      const batch = await Promise.all(windows.map(([a, b]) => fetchWindow(a, b)));
      for (const items of batch) found.push(...items);
      from = windows[windows.length - 1][1] + 1n;
      retries = 0;
    } catch (e) {
      const err = e as { message?: string; details?: string; shortMessage?: string };
      const text = `${err.shortMessage ?? ""} ${err.details ?? ""} ${err.message ?? ""}`;
      if (isRateLimited(text) && retries < MAX_RETRIES) {
        // Back off and retry the same windows: 0.5s, 1s, 2s, ...
        await new Promise((r) => setTimeout(r, 500 * 2 ** retries++));
        continue;
      }
      const smaller = nextChunk(text, chunk);
      if (smaller === undefined) throw e;
      chunk = smaller;
      learnedChunk.set(chainId, chunk);
    }
  }
  const all = [...(prior?.items ?? []), ...found];
  scans.set(key, { next: head + 1n, items: all });
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
