import Link from "next/link";
import WalletButton from "./WalletButton";

export default function Nav() {
  return (
    <header className="nav">
      <Link href="/" className="brand">
        BidaFlux
      </Link>
      <nav className="row">
        <Link href="/">Auctions</Link>
        <Link href="/sell">Sell</Link>
        <Link href="/activity">Activity</Link>
      </nav>
      <WalletButton />
    </header>
  );
}
