import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import Nav from "@/components/Nav";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const TITLE = "Jev Chess — 1 minute blitz against a decision model";
const DESCRIPTION =
  "Play one-minute blitz against Jev, TypeSafe's System One model. It does not " +
  "generate moves — code generates every legal move and Jev decides which one " +
  "to play, in about half a second. Powered by loopengine.tech";
const SHORT_DESCRIPTION =
  "One minute each. You versus a model that judges between moves rather than generating them.";

export const metadata: Metadata = {
  // Required for Open Graph and Twitter: relative image paths do not unfurl.
  metadataBase: new URL(siteUrl()),
  title: {
    default: TITLE,
    template: "%s — Jev Chess",
  },
  description: DESCRIPTION,
  applicationName: "Jev Chess",
  authors: [{ name: "LoopEngine", url: "https://loopengine.tech" }],
  creator: "LoopEngine",
  publisher: "LoopEngine",
  category: "games",
  keywords: [
    "chess",
    "blitz chess",
    "1 minute chess",
    "Jev",
    "TypeSafe",
    "System One",
    "decision model",
    "AI chess",
    "play chess online",
    "loopengine",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Jev Chess",
    title: TITLE,
    description: SHORT_DESCRIPTION,
    url: "/",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jev Chess — one minute each",
    description: SHORT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
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
