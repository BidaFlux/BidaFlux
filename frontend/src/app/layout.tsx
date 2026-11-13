import type { Metadata } from "next";
import type { ReactNode } from "react";
import Nav from "@/components/Nav";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "BidaFlux",
  description: "One NFT, one Dutch auction, buyers on multiple chains, one winner. Coordinated by Reactive.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
