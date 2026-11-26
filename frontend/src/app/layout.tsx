import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";
import Nav from "@/components/Nav";
import Providers from "./providers";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "BidaFlux",
  description: "One NFT, one Dutch auction, buyers on multiple chains, one winner. Coordinated by Reactive.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <Providers>
          <a className="skip" href="#main">Skip to content</a>
          <Nav />
          <main id="main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
