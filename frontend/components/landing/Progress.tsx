import { PROGRESS } from "./data";

export default function Progress() {
  const W = 640, H = 260, pl = 40, pr = 16, pt = 20, pb = 34;
  const max = 2.2;
  const vals = PROGRESS.blundersPerGame;
  const x = (i: number) => pl + (i * (W - pl - pr)) / (vals.length - 1);
  const y = (v: number) => pt + (1 - v / max) * (H - pt - pb);
  const path = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return (
    <section id="progress" className="mx-auto max-w-[1180px] px-5 py-24">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <figure className="rounded-[18px] border border-[#D5DCE4] bg-white p-5">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby="prog-title prog-desc">
            <title id="prog-title">Blunders per game over eight weeks</title>
            <desc id="prog-desc">Example player: blunders per game fall from {vals[0]} in week 1 to {vals[vals.length - 1]} in week 8.</desc>
            {[0, 0.5, 1, 1.5, 2].map((t) => (
              <g key={t}>
                <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="#E4E9EF" />
                <text x={pl - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8593A6">{t}</text>
              </g>
            ))}
            {PROGRESS.weeks.map((w, i) => (
              <text key={w} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#8593A6">{w}</text>
            ))}
            <path d={path} fill="none" stroke="#13233A" strokeWidth="2.5" strokeLinejoin="round" />
            {vals.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="4" fill={i === vals.length - 1 ? "#1F7A4D" : "#13233A"} />
            ))}
            <text x={x(vals.length - 1) - 8} y={y(vals[vals.length - 1]) + 24} textAnchor="end" fontSize="12" fontWeight="600" fill="#1F7A4D">
              {vals[vals.length - 1]} per game
            </text>
          </svg>
          <figcaption className="mt-2 text-sm text-[#56657A]">Example player, blunders per game after eight weeks of drills.</figcaption>
          <table className="sr-only">
            <caption>Blunders per game by week</caption>
            <tbody>
              {PROGRESS.weeks.map((w, i) => (
                <tr key={w}><th scope="row">{w}</th><td>{vals[i]}</td></tr>
              ))}
            </tbody>
          </table>
        </figure>
        <div>
          <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.01em] text-[#13233A]" style={{ fontStretch: "115%" }}>
            Know if the training is working
          </h2>
          <p className="mt-4 max-w-[44ch] text-[17px] leading-relaxed text-[#3B4B62]">
            Track your rating, accuracy and mistakes per game over time. When a weakness stops showing up in your games, you will see it on the chart.
          </p>
        </div>
      </div>
    </section>
  );
}
