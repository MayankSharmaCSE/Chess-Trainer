import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Noto_Sans_Symbols_2 } from "next/font/google";
import "./globals.css";
import "@/components/landing/landing.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const chess = Noto_Sans_Symbols_2({ subsets: ["symbols"], weight: "400", variable: "--font-chess", display: "swap" });

export const metadata: Metadata = {
  title: "ChessLens: find out why you lose at chess",
  description:
    "Connect Chess.com or Lichess. Stockfish checks every move, your repeated mistakes are grouped into a weakness map, and you train on positions from your own games.",
  openGraph: {
    title: "ChessLens: find out why you lose at chess",
    description: "Stockfish analysis, AI explanations and drills built from your own games.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable} ${chess.variable}`}>
      <body>{children}</body>
    </html>
  );
}
