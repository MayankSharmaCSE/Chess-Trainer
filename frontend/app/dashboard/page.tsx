import Link from "next/link";
import DashboardClient from "@/components/dashboard/DashboardClient";
import ProgressChart from "@/components/progress/ProgressChart";
import WeaknessHeatmap from "@/components/weaknesses/WeaknessHeatmap";

export const metadata = {
  title: "Dashboard — ChessLens",
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#F2F4F6] font-body text-[#13233A] antialiased">
      <main className="mx-auto w-full max-w-[960px] px-5 py-12">
        <p className="text-sm text-[#56657A]">
          <Link href="/#top" className="underline underline-offset-2 hover:text-[#13233A]">Home</Link>
          {" / Dashboard"}
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold tracking-[-0.01em]">
          Dashboard
        </h1>
        <div className="mt-6 rounded-[18px] border border-[#D5DCE4] bg-white p-5">
          <DashboardClient />
        </div>
        {/* AI Chess Bot Arena Banner */}
        <div className="mt-6 overflow-hidden rounded-[18px] border border-slate-800 bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0B1120] p-6 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                New Feature
              </div>
              <h2 className="mt-2 font-display text-xl font-bold text-white">AI Chess Bot Arena</h2>
              <p className="mt-1 text-sm text-slate-300">
                Play against 9 calibrated AI bots (ratings 400 to 2000), see real-time moves, and analyze your performance with Stockfish.
              </p>
            </div>
            <Link
              href="/bots"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 shrink-0"
            >
              <span>Enter Arena</span>
              <span>⚔</span>
            </Link>
          </div>
        </div>
        <div className="mt-6 rounded-[18px] border border-[#D5DCE4] bg-white p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold">Weakness heatmap</h2>
          <p className="mt-1 text-sm text-[#56657A]">
            Your repeated mistakes grouped by game phase. Counts are labelled, not color-only.
          </p>
          <div className="mt-4">
            <WeaknessHeatmap compact />
          </div>
        </div>
        <div className="mt-6 rounded-[18px] border border-[#D5DCE4] bg-white p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold">Progress over time</h2>
          <p className="mt-1 text-sm text-[#56657A]">
            Rating, accuracy and mistakes per game — plus training completion.
          </p>
          <div className="mt-4">
            <ProgressChart />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/bots" className="rounded-[10px] bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
            AI Bot Arena ⚔
          </Link>
          <Link href="/weaknesses" className="rounded-[10px] bg-[#13233A] px-4 py-2 font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A]">
            Open weakness map
          </Link>
          <Link href="/training" className="rounded-[10px] bg-[#1F7A4D] px-4 py-2 font-semibold text-white hover:bg-[#16663E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F7A4D]">
            Train on my mistakes
          </Link>
          <Link href="/connect" className="rounded-[10px] border border-[#D5DCE4] bg-white px-4 py-2 font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]">
            Connect account
          </Link>
          <Link href="/games" className="rounded-[10px] border border-[#D5DCE4] bg-white px-4 py-2 font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]">
            Game library
          </Link>
        </div>
      </main>
    </div>
  );
}
