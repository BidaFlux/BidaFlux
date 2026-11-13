# Event and callback schema

`campaignId` is `bytes32`. `intentId = keccak256(abi.encode(block.chainid, vault, buyer, nonce))`. `srcChainId` comes from the reactive `LogRecord.chainId`, not from the payload.

## Origin events

### `PaymentVault` (Base Sepolia, Unichain Sepolia)

```solidity
event IntentSubmitted(
    bytes32 indexed campaignId,
    bytes32 indexed intentId,
    address indexed buyer,
    uint256 lockAmount,
    uint256 intentTs   // block.timestamp of the submitting tx
);
```

### `AuctionEscrow` (Base Sepolia)

```solidity
event CampaignCreated(bytes32 indexed campaignId, address indexed seller, address nft, uint256 tokenId, uint256 start, uint256 expiry);
event Settled(bytes32 indexed campaignId, bytes32 indexed intentId, address indexed buyer, uint256 srcChainId, uint256 price, address payout);
event IntentRejected(bytes32 indexed campaignId, bytes32 indexed intentId, uint256 srcChainId, uint8 reason);
event Reclaimed(bytes32 indexed campaignId);
```

`IntentRejected.reason`: 1 inactive, 2 duplicate, 3 time window, 4 stale, 5 chain not enabled, 6 underfunded.

## Reactive subscriptions (Lasna)

One `SYSTEM.subscribe(chainId, address, topic0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE)` each:

| Origin | Address | topic0 |
|---|---|---|
| Base Sepolia (84532) | Base vault | `IntentSubmitted` |
| Unichain Sepolia (1301) | Unichain vault | `IntentSubmitted` |
| Base Sepolia (84532) | `AuctionEscrow` | `Settled` |
| Base Sepolia (84532) | `AuctionEscrow` | `IntentRejected` |
| Base Sepolia (84532) | `AuctionEscrow` | `Reclaimed` |

`react()` checks `chainId`, `contractAddress` and `topic0`, falls through on anything else (a revert is still billed), and de-duplicates by `txHash` + `logIndex`.

## Callbacks

The first parameter of every callback is the injected reactive-contract address (pass `address(0)` from Reactive).

| Hop | Target | Function |
|---|---|---|
| 1 | `AuctionEscrow` (Base) | `settle(address rvm, bytes32 campaignId, bytes32 intentId, address buyer, uint256 srcChainId, uint256 lockAmount, uint256 intentTs)` |
| 2 | each `PaymentVault` | `finalizeCampaign(address rvm, bytes32 campaignId, bytes32 winnerIntentId, uint256 winnerChainId, uint256 price, address payout)` |
| 2 | source `PaymentVault` | `releaseIntent(address rvm, bytes32 intentId)` (for `IntentRejected`) |

Authorization on every callback target: `onlyServiceProvider` (callback proxy) and `onlyCallbackSender(rvm)`.

Callback proxies: Base `0x476F44b11F5C942c58f4c8E3d0300E5710743585`, Unichain `0x775c9B990ADe401060B78D0e98684eEf8d2466C1` (see `reactive-integration-notes.md`).

## Latency measurements (for the demo)

- Hop 1: `IntentSubmitted` block time to `settle` callback block time.
- Hop 2: `Settled` block time to vault payout block time.
- Record from explorer timestamps; do not fabricate.
