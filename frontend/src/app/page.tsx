import CampaignList from "@/components/CampaignList";
import NotDeployed from "@/components/NotDeployed";
import { isDeployed } from "@/lib/config";

export default function Home() {
  return (
    <>
      <h1>Auctions</h1>
      <p className="small">
        One NFT, one Dutch auction. Buyers on Base Sepolia and Unichain Sepolia compete for the same escrowed NFT; Reactive
        relays their intents and the escrow accepts exactly one winner.
      </p>
      {isDeployed ? <CampaignList /> : <NotDeployed />}
    </>
  );
}
