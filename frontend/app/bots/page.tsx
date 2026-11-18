import BotArenaClient from "@/components/arena/BotArenaClient";

export const metadata = {
  title: "AI Chess Bot Arena — ChessLens",
  description:
    "Play against AI bots from Beginner (400) to Grandmaster (2000). Real-time engine moves, adaptive difficulty, and Stockfish game analysis.",
};

export default function BotArenaPage() {
  return (
    <div className="min-h-screen bg-[#0A0F1D] font-body text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">
      <BotArenaClient />
    </div>
  );
}
