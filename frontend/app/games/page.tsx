import Link from "next/link";
import GamesClient from "@/components/games/GamesClient";

export const metadata = {
  title: "Game library — ChessLens",
};

export default function GamesPage() {
  return (
    <div className="min-h-screen bg-[#F2F4F6] font-body text-[#13233A] antialiased">
      <main className="mx-auto w-full max-w-[860px] px-5 py-12">
        <p className="text-sm text-[#56657A]">
          <Link href="/dashboard" className="underline underline-offset-2 hover:text-[#13233A]">
            Dashboard
          </Link>
          {" / Games"}
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold tracking-[-0.01em]">
          Game library
        </h1>
        <div className="mt-6">
          <GamesClient />
        </div>
      </main>
    </div>
  );
}
