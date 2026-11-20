import EndgameDrillClient from "@/components/endgame/EndgameDrillClient";

export const metadata = {
  title: "Endgame Drill — ChessLens",
  description: "Interactive endgame training drill powered by Stockfish.",
};

type Props = {
  params: Promise<{ drillId: string }>;
};

export default async function EndgameDrillPage({ params }: Props) {
  const { drillId } = await params;
  return (
    <div className="min-h-screen bg-[#0A0F1D] font-body text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">
      <EndgameDrillClient key={drillId} drillId={drillId} />
    </div>
  );
}