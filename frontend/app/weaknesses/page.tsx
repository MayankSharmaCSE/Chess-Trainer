import Link from "next/link";
import WeaknessHeatmap from "@/components/weaknesses/WeaknessHeatmap";

export const metadata = {
  title: "Weakness map — ChessLens",
};

export default function WeaknessesPage() {
  return (
    <div className="min-h-screen bg-[#F2F4F6] font-body text-[#13233A] antialiased">
      <main className="mx-auto w-full max-w-[960px] px-5 py-12">
        <p className="text-sm text-[#56657A]">
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
      </main>
    </div>
  );
}
