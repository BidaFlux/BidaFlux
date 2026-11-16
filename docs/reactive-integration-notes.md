# Reactive integration notes

Source: dev.reactive.network (`/origins-and-destinations`, `/reactive-contracts`, `/callback-contracts`, `/economy`), read 2026-11-13. Re-verify addresses before deploying; the legacy docs list different proxy addresses.

## Chains (testnet only; do not mix testnet and mainnet)

| Chain | Chain ID | Role | Callback proxy |
|---|---|---|---|
| Base Sepolia | 84532 | origin + destination (canonical escrow) | `0x476F44b11F5C942c58f4c8E3d0300E5710743585` |
| Unichain Sepolia | 1301 | origin (intent adapter) | `0x775c9B990ADe401060B78D0e98684eEf8d2466C1` |
| Reactive Lasna | 5318007 | reactive layer, RPC `https://lasna-rpc.rnk.dev/` | `0x8888888888888888888888888888888888888888` |

## Reactive contract

- Inherit `AbstractReactive` / `AbstractPayer` from `reactive-lib-omni`.
- Subscribe with `SYSTEM.subscribe(chainId, contract, topic0, topic1, topic2, topic3)`. Exact-match only; at least one criterion must be specific; `REACTIVE_IGNORE` wildcards a topic. One subscription per origin chain/adapter (no OR).
- `react(LogRecord)` is `onlySystem`. Route on `topic0` and check `opCode` before decoding `data`. Do not revert on non-matching logs: reverts are still billed.
- `LogRecord` has no block timestamp. Put `block.timestamp` in the intent event payload.
- `txHash` and `blockHash` are `uint256`.
- Callback: `SYSTEM.requestCallbackV_1_0({chainId, recipient, gasLimit, payload})`. Payload's first 160 bits are overwritten with the reactive contract address, so the first parameter of the target function must be an `address` (pass `address(0)`).
- Gas: reactive tx cap 900,000; callbacks need at least 100,000, and a too-tight limit gives `CallbackFailure`/`InsufficientGas`.

## Destination (escrow) contract

- Inherit `AbstractCallback`; constructor takes the Base Sepolia callback proxy and the authorized reactive contract.
- Both checks are required: `onlyServiceProvider` (caller is the proxy) and `onlyCallbackSender(reactive_)` (injected address equals `_CALLBACK_SENDER`).
- The docs do not describe retries. Treat a failed callback as lost and design a manual re-trigger path.

## Funding

- Reactive contract: REACT, via payable constructor or `SYSTEM.depositTo(contract)`. Debt above zero stops `react()` entirely. Expose a `coverDebt()` wrapper.
- Escrow contract (callback recipient): billed in **Base Sepolia ETH**, via `depositTo(escrow)` on the callback proxy. Debt above zero stops callbacks (`InDebt`). Keep it funded before the demo.
- Check `debt(address)` and `reserves(address)` on the system contract and proxy.
- Not found in the docs: the Lasna faucet URL (the blog post links one), and the Omni vs Legacy behavioral differences.

## Open items to verify while building

1. Exact `reactive-lib-omni` package name and version, and the `AbstractReactive` constructor.
2. Typical origin-event to callback latency on Lasna (measure; do not assume).
3. Whether Reactive observes Base Sepolia (200ms blocks) logs with any confirmation delay.
