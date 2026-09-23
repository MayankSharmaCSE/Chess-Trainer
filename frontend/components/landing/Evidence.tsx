import { DEMO_GAME, DEMO_MISTAKES } from "./data";

const m = DEMO_MISTAKES[1];
const CHAIN = [
  { k: "Game", v: "Italian Game, you vs opponent" },
  { k: "Move", v: `${m.label}, played as White` },
  { k: "Position", v: "Knight on e5, queen hitting g2" },
  { k: "Stockfish", v: `${m.evalBefore} → ${m.evalAfter}, best ${m.best.san.replace(/-/g, "\u2011")}` },
  { k: "Explanation", v: "Written from that evidence only" },
];

export default function Evidence() {
  return (
    <section className="border-y border-[#D5DCE4] bg-white">
      <div className="mx-auto max-w-[1180px] px-5 py-20">
        <div className="max-w-[60ch]">
          <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.01em] text-[#13233A]" style={{ fontStretch: "115%" }}>
            The engine decides. The AI explains.
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-[#3B4B62]">
            AI models are not reliable at calculating chess. So they never judge your moves here. {DEMO_GAME.engine.split(",")[0]} does the analysis, and the AI only puts its findings into words. Every explanation links back to the exact game, move and engine line it came from, and says so when the evidence is unclear.
          </p>
        </div>
        <ol className="mt-12 grid gap-3 md:grid-cols-5 md:gap-0">
          {CHAIN.map((c, i) => (
            <li key={c.k} className="relative md:pr-6">
              <div className="rounded-[10px] border border-[#D5DCE4] bg-[#F2F4F6] p-4 md:h-full">
                <p className="text-[13px] font-semibold text-[#56657A]">{c.k}</p>
                <p className="mt-1 text-[15px] font-medium leading-snug text-[#13233A]">{c.v}</p>
              </div>
              {i < CHAIN.length - 1 && (
                <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 text-[#8593A6] md:block" aria-hidden="true">›</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
