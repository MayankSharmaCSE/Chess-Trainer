import Link from "next/link";
import TrainingClient from "@/components/training/TrainingClient";

export const metadata = {
  title: "Training — ChessLens",
};

export default function TrainingPage() {
  return (
    <div className="min-h-screen bg-[#F2F4F6] font-body text-[#13233A] antialiased">
      <main className="mx-auto w-full max-w-[960px] px-5 py-12">
        <p className="text-sm text-[#56657A]">
          <Link href="/dashboard" className="underline underline-offset-2 hover:text-[#13233A]">
            Dashboard
          </Link>
          {" / Training"}
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold tracking-[-0.01em]">
          Personalized drills
        </h1>
        <p className="mt-2 text-[15px] text-[#56657A]">
          Positions you got wrong in your own games. Find Stockfish&apos;s best move — worst blunders first.
        </p>
        <div className="mt-6">
          <TrainingClient />
        </div>
      </main>
    </div>
  );
}
