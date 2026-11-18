import { decodeAbiParameters, decodeFunctionData, parseAbi, type Address } from "viem";
import { lasna } from "./chains";
import { deployment } from "./config";
import { getRawLogs, type DecodedLog } from "./logs";

/** Lasna's system contract, which emits Callback(chainId, destination, gasLimit, payload) for every callback a reactive contract requests. */
export const SYSTEM_CONTRACT: Address = "0x8888888888888888888888888888888888888888";
export const CALLBACK_TOPIC = "0xef94dbc611c4b95bf4b8ba34b413972180c2faf26fbb480befacedd83e07b133";

const callbackAbi = parseAbi([
  "function settle(address rvm_, bytes32 campaignId, bytes32 intentId, address buyer, uint256 srcChainId, uint256 lockAmount, uint256 intentTs)",
  "function finalizeCampaign(address rvm_, bytes32 campaignId, bytes32 winnerIntentId, uint256 winnerChainId, uint256 price, address payout)",
  "function releaseIntent(address rvm_, bytes32 intentId)",
]);

/** One callback the coordinator asked Lasna to deliver, with the Lasna transaction that requested it. */
export interface ReactiveTx {
  txHash: `0x${string}`;
  blockNumber: bigint;
  /** Chain the callback was delivered to. */
  destChainId: number;
  kind: "settle" | "finalize" | "release";
  /** settle and release: the intent. finalize: the winning intent (zero when there is no winner). */
  intentId: `0x${string}`;
  campaignId?: `0x${string}`;
}

/** Decodes a Callback log's data (an ABI-encoded `bytes payload`) and topic1 (destination chain). Undefined for any other call. */
export function decodeCallbackLog(l: { txHash: `0x${string}`; blockNumber: bigint; args: Record<string, any> }): ReactiveTx | undefined { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const [payload] = decodeAbiParameters([{ type: "bytes" }], l.args.data);
    const call = decodeFunctionData({ abi: callbackAbi, data: payload });
    const base = { txHash: l.txHash, blockNumber: l.blockNumber, destChainId: Number(BigInt(l.args.topics[1])) };
    if (call.functionName === "settle") return { ...base, kind: "settle", campaignId: call.args[1], intentId: call.args[2] };
    if (call.functionName === "finalizeCampaign") return { ...base, kind: "finalize", campaignId: call.args[1], intentId: call.args[2] };
    if (call.functionName === "releaseIntent") return { ...base, kind: "release", intentId: call.args[1] };
  } catch {
    /* not one of ours */
  }
  return undefined;
}

const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;

/**
 * Every callback Lasna was asked to deliver to this deployment's contracts, found from the system contract's Callback logs.
 * Only calls to our escrow and vaults are read, so this is the coordinator's work and nothing else.
 */
export async function loadReactiveTxs(): Promise<ReactiveTx[]> {
  const from = deployment.fromBlock[lasna.id];
  const dests = [deployment.escrow, ...Object.values(deployment.vault)].filter((a): a is Address => Boolean(a));
  if (from === undefined || !dests.length) return [];
  const logs: DecodedLog[] = await getRawLogs({ chainId: lasna.id, address: SYSTEM_CONTRACT, topics: [CALLBACK_TOPIC, null, dests.map(pad)] });
  return logs.flatMap((l) => {
    const tx = decodeCallbackLog(l);
    return tx ? [tx] : [];
  });
}
