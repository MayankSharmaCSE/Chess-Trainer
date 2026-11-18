import BotGameClient from "@/components/arena/BotGameClient";

export const metadata = {
  title: "AI Chess Match — ChessLens Bot Arena",
  description: "Play live against an AI Chess Bot powered by Stockfish.",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function BotGamePage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-[#0A0F1D] font-body text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">
      <BotGameClient gameId={id} />
    </div>
  );
}
