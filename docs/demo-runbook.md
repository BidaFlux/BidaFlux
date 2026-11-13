# Runbook: loop spike (Base/Unichain Sepolia -> Lasna -> Base Sepolia)

Goal: one real transaction chain: origin `Ping` event -> Lasna `react()` -> callback `pong()` on Base Sepolia. This is the Execution gate for the hackathon.

## Prerequisites

1. Throwaway testnet wallet; put its key in `.env` (`DEPLOYER_PRIVATE_KEY`). Never commit it.
2. Base Sepolia ETH and Unichain Sepolia ETH from any public faucet.
3. lREACT: send Base Sepolia ETH to the Reactive faucet contract `0x2afaFD298b23b62760711756088F75B7409f5967` (1 ETH = 100 lREACT, max 5 ETH per tx), e.g. `cast send 0x2afaFD298b23b62760711756088F75B7409f5967 "request(address)" <wallet> --value 0.02ether --rpc-url $BASE_SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY`.
4. Verify addresses against https://dev.reactive.network/origins-and-destinations before deploying.

## Steps (from `contracts/`)

1. `forge script script/Spike.s.sol:DeployOrigin --rpc-url unichain_sepolia --broadcast` -> `ORIGIN_ADDR`.
2. Precompute the Lasna reactive address from the deployer's next Lasna nonce (`cast nonce`, `cast compute-address`).
3. `forge script script/Spike.s.sol:DeployCallback --rpc-url base_sepolia --broadcast` with `CALLBACK_PROXY`, `REACTIVE_ADDR` -> `DEST_ADDR`.
4. `forge script script/Spike.s.sol:DeployReactive --rpc-url lasna --broadcast` with `ORIGIN_CHAIN_ID=1301`, `ORIGIN_ADDR`, `DEST_CHAIN_ID=84532`, `DEST_ADDR`. Its address must equal the precomputed one.
5. `cast send $ORIGIN_ADDR "ping()" --rpc-url unichain_sepolia --private-key $DEPLOYER_PRIVATE_KEY`.
6. Watch for `Pong` on `DEST_ADDR` (Basescan) and the reactive transaction on https://lasna.reactscan.net/.

## Check list if nothing arrives

- `debt(address)` and `reserves(address)` on the callback proxy for `DEST_ADDR`, and on the system contract `0x8888888888888888888888888888888888888888` for the reactive contract. Any debt halts execution.
- Callback gas limit 300,000 (minimum 100,000); raise if `CallbackFailure` appears.
- Subscription chain ID and origin address match the Ping emitter.

## Record

Save addresses and transaction hashes in `deployments/*.json` (no secrets), and the hop latency from explorer timestamps.

# Runbook: full deployment

Only after the spike loop above has produced a `Pong` on Base Sepolia.

1. `RVM_ADDR`: compute from the deployer's next Lasna nonce: `cast compute-address <deployer> --nonce $(cast nonce <deployer> --rpc-url lasna)`. The coordinator must be the next Lasna contract deployed from that account, so deploy nothing else on Lasna in between.
2. `forge script script/Deploy.s.sol:DeployBase --rpc-url base_sepolia --broadcast` -> token, `DemoNFT`, `AuctionEscrow`, base vault. Also funds callback-proxy reserves for the escrow and vault in Base Sepolia ETH.
3. `forge script script/Deploy.s.sol:DeployUni --rpc-url unichain_sepolia --broadcast` -> token, unichain vault, reserve funding.
4. `forge script script/Deploy.s.sol:DeployLasna --rpc-url lasna --broadcast` with `ESCROW_ADDR`, `BASE_VAULT_ADDR`, `UNI_VAULT_ADDR`. The script fails if the coordinator address differs from `RVM_ADDR`.
5. Check `debt` and `reserves` for the escrow and both vaults on their callback proxies, and for the coordinator on the system contract, before the first intent.
6. Record addresses in `deployments/*.json` (no secrets).

## Demo scenario (real transactions only)

1. Seller: `DemoNFT.mint()`, approve the escrow, `createCampaign` with both chains enabled.
2. Buyer A (Unichain): `faucet`, `approve`, `deposit`, `submitIntent`. Buyer B (Base): the same on Base.
3. Wait for the coordinator and callbacks; open the transactions on the Base, Unichain and Lasna explorers.
4. Verify: one `Settled`, the NFT owner is the winner, the seller was paid on the winner's chain, the loser's balance is whole again after `IntentRejected` or `unlock`.
5. Record hop latency from explorer timestamps. Do not estimate.
