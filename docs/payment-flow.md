# Payment flow and winner policy (amendment to PRD v1.1, sections 9 and 10)

Status: decided design for the MVP. Replaces the PRD's "pay on Base after the winner is selected" model.

## Decisions

| Topic | Decision |
|---|---|
| Payment model | Per-chain `PaymentVault` on Base Sepolia and Unichain Sepolia. Buyers deposit on the chain they bid from. No token bridging. |
| Seller payout | Seller is paid on the chain where the winner paid. Per-chain payout address and token are set at campaign creation and stored in `AuctionEscrow` (Base) only. |
| Pricing | Winner pays `P(intentTs)`, where `intentTs` is the source-chain `block.timestamp` emitted with the intent. Fixed protocol rule, not a seller option. |
| Grace window | `GRACE = 120s`, a deployment constant. An intent is rejected if `callbackTime - intentTs > GRACE`. |
| Winner | First intent that passes every `AuctionEscrow` check, in the order the reactive contract relays them. "First" means first processed by Reactive, not earliest wall-clock click. |
| Settlement order | NFT moves first, seller payout second. Safe because the winner's funds are already locked in the vault. |

## Contracts

- `AuctionEscrow` (Base): holds the NFT, campaign parameters, per-chain payout config, and the one-winner state machine. Only authority on who wins.
- `PaymentVault` (Base, Unichain): holds buyer deposits. Locks funds when an intent is submitted. Pays the seller or unlocks buyers only on a callback from the reactive contract.
- `ReactiveCoordinator` (Lasna): allowlists, de-duplicates and relays. Holds no funds and makes no decision about who wins.
- `MockToken` (both chains): ERC-20 with a public faucet function and matching decimals.

## Flow

```
Buyer ──deposit──▶ Vault (own chain)
Buyer ──submitIntent(campaignId, lockAmount)──▶ Vault locks funds, emits IntentSubmitted
                         │
                         ▼
        ReactiveCoordinator (Lasna)  ── hop 1: callback settle(...) ──▶ AuctionEscrow (Base)
                                                                          │ first valid intent wins:
                                                                          │ NFT -> buyer, emits Settled
                                                                          │ invalid intent: emits IntentRejected
                         ┌────────────────────────────────────────────────┘
                         ▼
        ReactiveCoordinator ── hop 2: callbacks ──▶ every Vault
             winner's vault: pay seller `price` to payout address, unlock remainder
             other vaults:   mark campaign final, losers' locks become withdrawable
```

1. Seller deposits the NFT and creates a campaign with the price curve, expiry, and for each enabled chain a payout address and token. Payout defaults to the seller's address.
2. Buyer deposits tokens into the vault on their chain, then calls `submitIntent(campaignId, lockAmount)`. The vault locks `lockAmount` and emits `IntentSubmitted` with `intentTs = block.timestamp`.
3. Reactive relays the intent to `AuctionEscrow.settle(...)`.
4. The escrow rejects (emit, no revert) if the campaign is not `Active`, the intent was seen, `intentTs` is outside `[start, expiry]`, the callback is later than `GRACE`, the chain is not enabled, or `lockAmount < P(intentTs)`. Otherwise it sets `Settled`, transfers the NFT once, and emits `Settled`.
5. Reactive reacts to `Settled`, `IntentRejected` and `Reclaimed` on the Base escrow and calls the vaults.
6. The winner's vault pays the seller and unlocks the winner's remainder. Other intents unlock.

Rejecting by event instead of revert keeps rejections visible in the activity monitor and avoids a billed `CallbackFailure`.

## Ordering statement

Two intents on different chains with near-identical timestamps may be processed in either order. The escrow accepts exactly one. BidaFlux does not claim the earliest real-world click wins.

## Seller payout rules

- The seller enables chains and supplies, per chain: `payoutAddress`, `token`.
- Reactive carries `payoutAddress` from the `Settled` event into the winner-chain vault callback. Vaults never store seller data.
- MVP assumption: payout addresses are EOAs controlled on that chain. The UI warns about smart-contract wallets. Not checked on-chain.

## Funds safety

- Withdraw: a buyer can withdraw unlocked deposits at any time.
- Locked funds are released only by a vault callback from the reactive contract (`onlyServiceProvider` + `onlyCallbackSender`).
- Lock timeout: a buyer may unlock an unsettled intent after `MAX_LOCK` (7 days). Known limitation: if hop 2 never reaches the vault of a *winning* intent, the winner could unlock after `MAX_LOCK` and keep the NFT. Mitigated by `replaySettlement`; documented, not solved in the MVP.
- Pull-based payouts and refunds, checks-effects-interactions, reentrancy guards.

## Failure handling

| Failure | Handling |
|---|---|
| Hop-1 callback fails (gas, debt) | Not retried by the network. Buyer or anyone calls `AuctionEscrow`-side recovery by re-submitting the intent on the vault (`resubmitIntent`, new `intentId`) within `GRACE`; otherwise the intent is stale and unlockable. |
| Hop-2 callback fails | `AuctionEscrow.replaySettlement(campaignId)` is permissionless and re-emits `Settled`; Reactive relays again. Vault callbacks are idempotent. |
| Duplicate delivery | `intentId` seen-sets in the escrow and vault finalize flags make it a no-op. |
| Escrow or vault in callback-proxy debt | Keep reserves funded in ETH; show reserves in the monitor; add a check script to the runbook. |
| Callback after expiry | Rejected by the time checks. |
| No winner by expiry | Seller `reclaim()` after `expiry + GRACE`, emitting `Reclaimed`; Reactive finalizes all vaults with no winner. |

## PRD sections affected

- 9: payment sequence replaced by the flow above.
- 10: winner policy replaced by the ordered-relay policy.
- 11.2: buyer actions `deposit`, `submitIntent`, `withdraw`.
- 15: add "an unfunded or invalid earlier intent does not block a later valid one" and "seller is paid on the winner's chain".
