import AnalysisDemo from "./AnalysisDemo";
import { SIGNUP_URL } from "./data";

export default function Hero() {
  return (
    <section id="top" className="mx-auto max-w-[1180px] px-5 pb-20 pt-12 sm:pt-16">
      <div className="grid items-end gap-8 lg:grid-cols-[1.35fr_1fr]">
        <h1 className="font-display text-[clamp(2.5rem,6.2vw,4.6rem)] font-extrabold leading-[0.98] tracking-[-0.02em] text-[#13233A]" style={{ fontStretch: "125%" }}>
          Find out why you lose, not just that you lose.
        </h1>
        <div className="lg:pb-2">
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-[#3B4B62]">
            Connect your Chess.com or Lichess account. Every game is checked by Stockfish, your repeated mistakes are grouped, and each one comes with a plain-language explanation and a drill built from your own position.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={SIGNUP_URL} className="rounded-[10px] bg-[#13233A] px-5 py-3 text-[16px] font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A]">
              Analyze my games
            </a>
            <p className="text-sm text-[#56657A]">Free to start. Only your username is needed.</p>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <AnalysisDemo />
        <p className="mt-3 text-center text-sm text-[#56657A]">
          This is a real game analyzed by Stockfish 16. Click any flagged move, or try to find the better move yourself.
        </p>
      </div>
    </section>
  );
}
