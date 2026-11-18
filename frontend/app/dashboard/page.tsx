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
