import Link from "next/link";
import BackButton from "@/components/nav/BackButton";
import GameReplay from "@/components/games/GameReplay";

export const metadata = {
  title: "Game replay — ChessLens",
};

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-[#F2F4F6] font-body text-[#13233A] antialiased">
      <main className="mx-auto w-full max-w-[960px] px-5 py-12">
        <BackButton fallbackHref="/games" />
        <p className="mt-4 text-sm text-[#56657A]">
          <Link href="/games" className="underline underline-offset-2 hover:text-[#13233A]">
            Game library
          </Link>
          {" / Replay"}
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold tracking-[-0.01em]">
          Game replay
        </h1>
        <div className="mt-6">
          <GameReplay id={id} />
        </div>
      </main>
    </div>
  );
}
