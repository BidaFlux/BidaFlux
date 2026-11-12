
# BidaFlux

**Reactive-powered cross-chain Dutch auctions for a single NFT.**

BidaFlux is a cross-chain NFT auction protocol that allows buyers on multiple blockchains to compete for the same unique NFT through a Dutch auction mechanism. Powered by Reactive smart contracts, BidaFlux coordinates purchase intents across supported networks and triggers the canonical settlement process while maintaining a single source of truth for NFT ownership.

> **One NFT. One auction. Multiple chains. One winner.**

---

## Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [Our Solution](#our-solution)
- [How BidaFlux Works](#how-bidaflux-works)
- [Dutch Auction Mechanism](#dutch-auction-mechanism)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Core Features](#core-features)
- [MVP Scope](#mvp-scope)
- [Security Considerations](#security-considerations)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development Status](#development-status)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Traditional NFT auctions are often restricted to a single blockchain ecosystem. Buyers operating on other networks may need to bridge assets or switch networks before participating.

BidaFlux introduces a different approach.

A seller deposits one ERC-721 NFT into a canonical escrow contract on **Base Sepolia**. Buyers on supported networks, initially Base Sepolia and Unichain Sepolia, can submit purchase intents for that same auction.

Reactive smart contracts observe these intents, coordinate the competing requests, and trigger callbacks to the canonical settlement contract.

The canonical contract remains responsible for enforcing the final outcome:

- Only one buyer can win.
- The NFT can only be transferred once.
- Payment must be secured before the NFT is released.
- Losing buyers have a defined refund mechanism.

BidaFlux uses Reactive Network to make cross-chain auction coordination possible without creating separate NFT listings or duplicated auction inventory.

## The Problem

Most blockchain auction systems operate within isolated ecosystems.

This creates several limitations:

1. **Fragmented liquidity:** Sellers may have to choose one blockchain and exclude buyers on other networks.
2. **Limited accessibility:** Buyers may need to bridge assets or move between networks before participating.
3. **Disconnected auction environments:** Separate chain-specific listings can divide competition for the same asset.
4. **Coordination challenges:** Managing competing purchase requests across multiple blockchains introduces asynchronous execution and settlement complexity.

A single NFT should not need multiple independent auction listings just to reach buyers across different ecosystems.

## Our Solution

BidaFlux creates one canonical auction for one unique NFT while allowing buyers on supported blockchains to participate.

Instead of deploying independent auctions on every supported network, BidaFlux uses Reactive smart contracts to observe purchase-intent events and coordinate the competition.

The NFT remains in canonical escrow on Base Sepolia throughout the auction.

Reactive coordinates the purchase-intent workflow, while the canonical contract enforces winner finalization and settlement.

**Important architectural distinction:** Reactive coordinates cross-chain events and callbacks. It does not automatically bridge NFTs or payment tokens. For the MVP, payment is secured on Base Sepolia, even when a buyer submits their purchase intent from Unichain Sepolia.

## How BidaFlux Works

The auction lifecycle consists of the following steps:

### 1. Seller creates an auction

The seller connects a wallet, selects an ERC-721 NFT, approves the escrow contract, and deposits the NFT into the canonical escrow on Base Sepolia.

The seller configures:

- Starting price
- Reserve price
- Price decrement
- Decrement interval
- Auction duration
- Accepted payment token

The contract creates a unique campaign for the deposited NFT.

### 2. Buyers discover the auction

Buyers on supported networks can access the same auction campaign.

For the MVP, supported buyer-intent networks are:

- Base Sepolia
- Unichain Sepolia

Regardless of the network from which they participate, buyers are competing for the same escrowed NFT.

### 3. Buyers submit purchase intents

When a buyer wants to purchase the NFT at the current Dutch auction price, they submit a purchase intent through the appropriate source-chain adapter.

The adapter emits a standardized on-chain event containing information such as:

- Campaign identifier
- Purchase-intent identifier
- Buyer address
- Offered price
- Payment information

A purchase intent represents a request to compete for the NFT. It is not, by itself, a completed purchase or proof of payment.

### 4. Reactive observes and coordinates intents

Reactive smart contracts subscribe to the supported purchase-intent events.

When an eligible event is observed, the Reactive coordinator:

1. Validates the source contract and event information.
2. Identifies the associated auction campaign.
3. Checks the purchase intent against the protocol's eligibility rules.
4. Applies the defined winner-coordination policy.
5. Triggers an authenticated callback to the canonical settlement contract.

For the MVP, the winner is determined by the first valid intent accepted and processed by the Reactive coordination flow, subject to canonical contract validation.

This does not claim globally earliest transaction ordering across independent blockchains.

### 5. Canonical settlement

The canonical contract on Base Sepolia receives the callback and validates the settlement conditions.

It must verify that:

- The callback is authentic.
- The campaign is still eligible for settlement.
- No winner has already been finalized.
- The winning buyer has secured the required payment on Base Sepolia.

Once these conditions are satisfied, the contract finalizes the winner, transfers the NFT to that buyer, and releases the seller's proceeds.

### 6. Losing buyers receive refunds

If multiple buyers submit valid intents, only one can win.

The protocol provides a refund path for losing buyers who have funds held by the protocol.

The refund mechanism must prevent unauthorized withdrawals and duplicate claims.

---

## Dutch Auction Mechanism

BidaFlux uses a Dutch auction in which the NFT price starts high and decreases over time until it reaches the seller's reserve price.

The price is calculated dynamically using the auction's timestamp.

The formula is:

```text
P(t) = max(Pmin, P0 - r * floor((t - t0) / Δt))
```

Where:

| Variable | Meaning |
|---|---|
| `P(t)` | Current auction price |
| `P0` | Starting price |
| `Pmin` | Reserve price |
| `r` | Price decrement per interval |
| `t` | Current timestamp |
| `t0` | Auction start timestamp |
| `Δt` | Decrement interval |

### Example

Suppose a seller configures an auction with:

- Starting price: 1,000 USDC
- Reserve price: 500 USDC
- Decrement: 50 USDC
- Interval: 10 seconds

The price evolves as follows:

| Elapsed time | Auction price |
|---|---:|
| 0 seconds | 1,000 USDC |
| 10 seconds | 950 USDC |
| 20 seconds | 900 USDC |
| 40 seconds | 800 USDC |
| 80 seconds | 600 USDC |
| 100 seconds | 500 USDC |

Once the reserve price is reached, the price remains at that level until the auction expires or is finalized.

The price is calculated when relevant contract functions are called. The protocol does not need a transaction for every price decrement.

**Implementation note:** Auction timing must use timestamps rather than block counts. Smart contracts must use integer token base units and safe arithmetic instead of floating-point calculations.

---

## System Architecture

BidaFlux consists of four major components.

### 1. Canonical NFT Escrow and Auction Contract

**Network:** Base Sepolia

Responsibilities:

- Receive and hold the seller's NFT.
- Create and manage auction campaigns.
- Calculate the current Dutch auction price.
- Track auction state.
- Authenticate winner callbacks.
- Enforce one-winner and one-transfer rules.
- Verify payment before settlement.
- Handle seller proceeds and unsold NFT recovery.

### 2. Purchase-Intent Adapters

**Networks:**
- Base Sepolia
- Unichain Sepolia

Responsibilities:

- Accept buyer purchase intents.
- Validate request parameters.
- Generate unique intent identifiers.
- Emit standardized purchase-intent events.
- Provide a consistent event interface for Reactive subscriptions.

### 3. Reactive Coordinator

**Network:** Reactive Lasna

Responsibilities:

- Subscribe to allowlisted purchase-intent events.
- Observe events from supported source networks.
- Validate source contracts and event information.
- Coordinate competing purchase intents.
- Apply the winner-selection policy.
- Trigger callbacks to the canonical contract.

### 4. Frontend and Monitoring Interface

Responsibilities:

- Provide seller and buyer interfaces.
- Display auction information and current prices.
- Allow buyers to submit purchase intents.
- Track auction lifecycle events.
- Display Reactive execution and callback activity.
- Provide transaction links for verification.

### Architecture Flow

```text
        BASE SEPOLIA                  UNICHAIN SEPOLIA
      Buyer A submits                 Buyer B submits
      purchase intent                 purchase intent
             |                               |
             v                               v
      Purchase Adapter                Purchase Adapter
             |                               |
             +---------------+---------------+
                             |
                             v
                    REACTIVE NETWORK
                    Reactive Coordinator
                             |
                     Validate and coordinate
                             |
                             v
                    Authenticated Callback
                             |
                             v
                  BASE SEPOLIA ESCROW
                    Canonical Contract
                             |
                  Verify payment and state
                             |
                    +--------+--------+
                    |                 |
                    v                 v
              Finalize winner    Refund eligible
                    |             losing buyers
                    v
              Transfer NFT
              Release proceeds
```

The diagram represents the intended MVP workflow. Each cross-chain observation, Reactive execution, callback, and canonical settlement occurs through its own transaction or execution step; the entire process is not atomic.

---

## Technology Stack

The intended technology stack includes:

| Component | Technology |
|---|---|
| Smart contracts | Solidity |
| Canonical network | Base Sepolia |
| Additional source network | Unichain Sepolia |
| Reactive execution | Reactive Network / Reactive Lasna |
| NFT standard | ERC-721 |
| Payment standard | ERC-20 |
| Frontend | To be finalized |
| Wallet integration | To be finalized |
| Development and testing | To be finalized |

Specific framework and library choices may be updated as implementation progresses.

---

## Core Features

- **Single-asset cross-chain auction:** One NFT is escrowed for one auction campaign.
- **Dutch auction pricing:** The NFT price decreases automatically as time passes.
- **Multi-chain buyer participation:** Buyers submit intents from supported networks.
- **Reactive coordination:** Reactive smart contracts observe and coordinate purchase intents.
- **Authenticated callbacks:** Reactive execution triggers the canonical settlement workflow.
- **Single-winner enforcement:** The canonical contract prevents multiple winners and duplicate NFT transfers.
- **Secure payment settlement:** Seller proceeds are released only after payment is secured.
- **Losing-buyer refunds:** Eligible losing buyers can recover funds held by the protocol.
- **Auction monitoring:** Users can inspect the auction lifecycle and verify transactions on-chain.

---

## MVP Scope

The initial implementation focuses on demonstrating a complete cross-chain auction lifecycle.

### Included

- One ERC-721 NFT per auction campaign.
- Canonical NFT custody on Base Sepolia.
- Buyer-intent submission on Base Sepolia and Unichain Sepolia.
- Reactive event observation and coordination.
- Authenticated callbacks.
- Dutch auction pricing.
- Canonical-chain payment settlement.
- One-winner enforcement.
- Losing-buyer refund functionality.
- Basic seller and buyer interfaces.
- Reactive activity monitoring.

### Not Included in the MVP

- General-purpose NFT bridging.
- Atomic cross-chain payment settlement.
- Remote-chain payment without a separately designed payment mechanism.
- Support for every EVM network.
- Fiat payment integration.
- Unattended automated purchases without explicit buyer authorization.

Remote-chain payment and broader cross-chain settlement may be explored in future versions.

---

## Security Considerations

Cross-chain coordination introduces asynchronous execution and additional trust boundaries.

BidaFlux must account for:

- **Callback authentication:** Unauthorized contracts must not be able to finalize auction winners.
- **Replay protection:** The same intent or callback must not be processed repeatedly.
- **Idempotency:** Duplicate callbacks must not cause duplicate settlement.
- **Reentrancy protection:** External NFT and token transfers must be handled safely.
- **Payment verification:** The NFT must not be released before the required payment is secured.
- **Refund protection:** Only eligible buyers may claim their own refundable funds.
- **Auction-state validation:** Expired or finalized campaigns must reject invalid settlement attempts.
- **Cross-chain finality:** The protocol must define when a source-chain event is considered sufficiently final.
- **Failure recovery:** Delayed or failed callbacks must not leave funds or NFTs permanently inaccessible.

BidaFlux is an experimental hackathon project. It is not intended for production financial use without independent security review and testing.

---

## Project Structure

The repository is expected to evolve toward the following organization:

```text
bidaflux/
│
├── contracts/
│   ├── src/
│   │   ├── CanonicalAuctionEscrow.sol
│   │   ├── PurchaseIntentAdapter.sol
│   │   └── interfaces/
│   ├── test/
│   └── script/
│
├── reactive/
│   ├── src/
│   ├── test/
│   └── README.md
│
├── frontend/
│   ├── src/
│   └── README.md
│
├── backend/
│
├── docs/
│   ├── architecture.md
│   ├── state-machine.md
│   ├── event-schema.md
│   ├── payment-flow.md
│   └── demo-runbook.md
│
├── deployments/
│   ├── base-sepolia.json
│   ├── unichain-sepolia.json
│   └── reactive-lasna.json
│
├── .env.example
├── README.md
└── LICENSE
```

---

## Getting Started

BidaFlux is under active development. Setup instructions will be expanded as the smart contracts, Reactive integration, and frontend are implemented.

### Prerequisites

You will need:

- Git
- Node.js and npm
- A Solidity development environment
- A Web3 wallet
- Base Sepolia testnet access
- Unichain Sepolia testnet access
- Reactive Network testnet access

### Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd bidaflux
```

### Install dependencies

Dependency installation commands will be documented once the project's development frameworks and package structure are finalized.

### Environment variables

Create a local environment file based on `.env.example` when available.

Never commit private keys, wallet seed phrases, or sensitive credentials.

---

## Development Status

**Project status:** Under development.

The initial architecture and product requirements define the intended MVP. Contract interfaces, Reactive integration, frontend functionality, and deployment details will be documented as implementation progresses.

Deployment addresses and transaction hashes will be added here once contracts are deployed and verified.

---

## Contributing

Contributions are welcome.

If you are contributing to BidaFlux:

1. Read the product requirements and architecture documentation.
2. Understand the single-asset auction model.
3. Preserve the canonical escrow and one-winner settlement invariants.
4. Test contract changes and cross-chain execution paths.
5. Document important architectural or security decisions.

For significant changes, discuss the proposed approach with the project team before implementation.

---

## License

This project is intended to be open-source. The repository license should be specified in the `LICENSE` file.

---

**BidaFlux — One NFT. One Auction. Multiple Chains. One Winner.**
