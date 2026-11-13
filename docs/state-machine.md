# State machine

## Campaign (`AuctionEscrow`, Base Sepolia)

```
Created ──(NFT deposited)──▶ Active ──(valid settle callback)──▶ Settled   [terminal]
                                 │
                                 └─(now >= expiry)──▶ Expired ──(reclaim, now >= expiry + GRACE)──▶ Reclaimed   [terminal]
```

| From | Action | To | Guard |
|---|---|---|---|
| Created | `createCampaign` | Active | NFT transferred in, valid parameters, at least one enabled chain |
| Active | `settle` callback | Settled | callback authenticated, intent not seen, chain enabled, `start <= intentTs <= expiry`, `now - intentTs <= GRACE`, `lockAmount >= P(intentTs)` |
| Active | time passes | Expired | `now >= expiry` (derived, not stored) |
| Expired | `reclaim` | Reclaimed | caller is seller, `now >= expiry + GRACE`, state not Settled |
| any | `replaySettlement` | unchanged | only if Settled; re-emits `Settled` |

Invalid `settle` callbacks leave the state unchanged and emit `IntentRejected`.

## Price

`P(t) = max(Pmin, P0 - r * floor((t - t0) / dt))` with integer base units and checked arithmetic. `t` is `intentTs`.

## Intent (`PaymentVault`, per chain)

```
none ──deposit──▶ (balance) ──submitIntent──▶ Locked ──┬─ winner callback ──▶ Paid        [terminal]
                                                       ├─ rejected / final callback ──▶ Unlocked  [terminal]
                                                       └─ MAX_LOCK elapsed (self-service) ──▶ Unlocked
```

- A vault marks a campaign `finalized` on the first final callback; repeats are no-ops.
- An intent is `Paid` at most once. The seller payout equals `price`; the remainder returns to the winner's balance.
