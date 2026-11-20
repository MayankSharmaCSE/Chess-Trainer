import EndgameTrainerClient from "@/components/endgame/EndgameTrainerClient";

export const metadata = {
  title: "Endgame Trainer — ChessLens",
  description:
    "Chess.com-style endgame training: a large interactive board with checkmates, pawn, minor piece, rook, queen and imbalance categories. Every position is randomly generated and Stockfish-verified.",
};

export default function EndgamePage() {
  return (
    <div className="min-h-screen bg-[#0A0F1D] font-body text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">
      <EndgameTrainerClient />
    </div>
  );
}