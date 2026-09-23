const STEPS = [
  { t: "Connect your account", d: "Enter your Chess.com or Lichess username. Your games are imported automatically, and new games sync as you play." },
  { t: "Every move gets checked", d: "Stockfish evaluates each position and marks blunders, mistakes and inaccuracies, with the move it would have played." },
  { t: "Train on what you actually miss", d: "Mistakes that keep coming back become your weakness map, and the positions you got wrong become your drills." },
];

export default function HowItWorks() {
  return (
    <section id="how" className="border-y border-[#D5DCE4] bg-white">
      <div className="mx-auto max-w-[1180px] px-5 py-20">
        <h2 className="max-w-[20ch] font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.01em] text-[#13233A]" style={{ fontStretch: "115%" }}>
          From your game history to a training plan in three steps
        </h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.t} className="relative border-t-2 border-[#13233A] pt-5">
              <span className="font-mono text-sm font-semibold text-[#56657A]">Step {i + 1}</span>
              <h3 className="mt-2 text-[20px] font-bold text-[#13233A]">{s.t}</h3>
              <p className="mt-2 max-w-[38ch] text-[16px] leading-relaxed text-[#3B4B62]">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
