"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "./WalletButton";

const TABS = [
  { href: "/", label: "Auctions" },
  { href: "/sell", label: "Sell" },
  { href: "/activity", label: "Activity" },
];

export default function Nav() {
  const path = usePathname();
  const current = (href: string) => (href === "/" ? path === "/" || path.startsWith("/campaign") : path.startsWith(href));
  return (
    <header className="nav">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden="true" />
        BidaFlux
      </Link>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={current(t.href) ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <WalletButton />
    </header>
  );
}
