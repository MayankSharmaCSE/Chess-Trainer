import Link from "next/link";
import BackButton from "@/components/nav/BackButton";
import WeaknessHeatmap from "@/components/weaknesses/WeaknessHeatmap";

export const metadata = {
  title: "Weakness map — ChessLens",
};

export default function WeaknessesPage() {
  return (
    <div className="min-h-screen bg-[#F2F4F6] font-body text-[#13233A] antialiased">
      <main className="mx-auto w-full max-w-[960px] px-5 py-12">
        <BackButton fallbackHref="/dashboard" />
        <p className="mt-4 text-sm text-[#56657A]">
          <Link href="/dashboard" className="underline underline-offset-2 hover:text-[#13233A]">
            Dashboard
          </Link>
          {" / Weaknesses"}
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold tracking-[-0.01em]">
          Weakness map
        </h1>
        <p className="mt-2 text-[15px] text-[#56657A]">
          One bad move is noise. The same mistake in many games is a pattern. Phases use ply 1–20
          (Opening), 21–60 (Middlegame), 61+ (Endgame).
        </p>
        <div className="mt-6 rounded-[18px] border border-[#D5DCE4] bg-white p-5 sm:p-6">
          <WeaknessHeatmap />
        </div>
        <div className="mt-6 flex flex-col gap-4 rounded-[18px] border border-[#D5DCE4] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="font-display text-xl font-bold">Train on my mistakes</h2>
            <p className="mt-1 text-sm text-[#56657A]">
              Replay the positions where you went wrong and find the better move.
            </p>
          </div>
          <Link
            href="/training"
            className="shrink-0 rounded-[10px] bg-[#1F7A4D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16663E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F7A4D]"
          >
            Train on my mistakes
          </Link>
        </div>
      </main>
    </div>
  );
}
