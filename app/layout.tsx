import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import Nav from "@/components/Nav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Jev Chess — 1 minute blitz against a decision model",
  description:
    "Play one-minute blitz against Jev, TypeSafe's System One model. Code generates the legal moves, Jev decides which one to play. Powered by loopengine.tech",
  applicationName: "Jev Chess",
  openGraph: {
    title: "Jev Chess",
    description: "One minute. You versus a decision model. Powered by loopengine.tech",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#262421",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>
                ♞
              </span>
              <span className="brand-text">
                <h1>Jev Chess</h1>
                <p>1 + 0 blitz against a decision model</p>
              </span>
            </Link>
            <Nav />
          </header>

          {children}

          <footer className="footer">
            <span>
              Powered by{" "}
              <a href="https://loopengine.tech" target="_blank" rel="noreferrer">
                loopengine.tech
              </a>
            </span>
            <span>
              Opponent:{" "}
              <a href="https://docs.typesafe.ai" target="_blank" rel="noreferrer">
                Jev
              </a>{" "}
              — TypeSafe&apos;s System One model
            </span>
            <span>
              Pieces by Colin M.L. Burnett,{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/3.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-SA 3.0
              </a>
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
