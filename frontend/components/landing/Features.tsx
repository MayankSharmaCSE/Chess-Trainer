const FEATURES = [
  { t: "Stockfish analysis of every game", d: "Each move is compared with the engine's best line, with the evaluation before and after." },
  { t: "Explanations you can check", d: "Plain-language reasons for each mistake, always linked to the position and engine line." },
  { t: "Your weakness map", d: "Repeated mistakes grouped by phase and type: tactics, king safety, pawn structure, endgames." },
  { t: "Drills from your own games", d: "Replay the exact positions you got wrong until you find the right move." },
  { t: "Opening and endgame reports", d: "Results by opening, common opening errors, and how often you convert winning endgames." },
  { t: "Progress over time", d: "Rating, accuracy and mistakes per game, week by week." },
];

export default function Features() {
  return (
    <section className="border-t border-[#D5DCE4] bg-white">
      <div className="mx-auto max-w-[1180px] px-5 py-20">
        <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.01em] text-[#13233A]" style={{ fontStretch: "115%" }}>
          What you get
        </h2>
        <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.t} className="border-t border-[#D5DCE4] pt-5">
              <dt className="text-[18px] font-bold text-[#13233A]">{f.t}</dt>
              <dd className="mt-1.5 max-w-[48ch] text-[16px] leading-relaxed text-[#3B4B62]">{f.d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
