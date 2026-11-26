import AuctionList from "@/components/AuctionList";
import NotDeployed from "@/components/NotDeployed";
import { isDeployed } from "@/lib/config";

export default function Home() {
  return (
    <>
      <div className="hero">
        <h1>Auctions</h1>
        <p className="small">
          One NFT, one Dutch auction. Buyers on Base Sepolia and Unichain Sepolia compete for the same escrowed NFT; Reactive
          relays their intents and the escrow accepts exactly one winner.
        </p>
      </div>
      {isDeployed ? <AuctionList /> : <NotDeployed />}
    </>
  );
}
