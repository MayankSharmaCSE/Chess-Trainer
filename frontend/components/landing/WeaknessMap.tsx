"use client";

import { useState } from "react";
import { WEAKNESS_CATEGORIES, WEAKNESS_COUNTS, WEAKNESS_NOTES, WEAKNESS_PHASES } from "./data";

function level(n: number) {
  if (n >= 14) return { word: "High", bg: "bg-[#13233A]", fg: "text-white" };
  if (n >= 8) return { word: "Medium", bg: "bg-[#5C6F8A]", fg: "text-white" };
  if (n >= 4) return { word: "Low", bg: "bg-[#C3CDD9]", fg: "text-[#13233A]" };
  return { word: "Rare", bg: "bg-[#EEF1F4]", fg: "text-[#56657A]" };
}

export default function WeaknessMap() {
  const [sel, setSel] = useState({ r: 1, c: 1 });
  const phase = WEAKNESS_PHASES[sel.r];
  const cat = WEAKNESS_CATEGORIES[sel.c];
  const n = WEAKNESS_COUNTS[sel.r][sel.c];
  const note = WEAKNESS_NOTES[`${phase}|${cat}`] ?? `${n} mistakes of this type across 120 analyzed games.`;

  return (
    <section id="weaknesses" className="mx-auto max-w-[1180px] px-5 py-24">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div>
          <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.01em] text-[#13233A]" style={{ fontStretch: "115%" }}>
            See the mistakes you keep repeating
          </h2>
          <p className="mt-4 max-w-[44ch] text-[17px] leading-relaxed text-[#3B4B62]">
            One bad move is noise. The same mistake in thirty games is a pattern. Your weakness map groups every flagged move by game phase and type, so you know exactly what to work on first.
          </p>
          <p className="mt-4 text-sm text-[#56657A]">Example report for a player with 120 analyzed games. Select a cell to see the details.</p>
        </div>

        <div className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-1.5">
              <caption className="sr-only">Mistakes by game phase and type across 120 games</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-28" />
                  {WEAKNESS_CATEGORIES.map((c) => (
                    <th key={c} scope="col" className="px-1 pb-1 text-left align-bottom text-[13px] font-semibold leading-tight text-[#3B4B62]">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEAKNESS_PHASES.map((p, r) => (
                  <tr key={p}>
                    <th scope="row" className="pr-2 text-left text-[14px] font-semibold text-[#13233A]">{p}</th>
                    {WEAKNESS_COUNTS[r].map((v, c) => {
                      const lv = level(v);
                      const active = sel.r === r && sel.c === c;
                      return (
                        <td key={c} className="p-0">
                          <button
                            type="button"
                            onClick={() => setSel({ r, c })}
                            aria-pressed={active}
                            aria-label={`${p}, ${WEAKNESS_CATEGORIES[c]}: ${v} mistakes, ${lv.word}`}
                            className={`flex h-[72px] w-full flex-col items-start justify-between rounded-[8px] p-2.5 text-left ${lv.bg} ${lv.fg} ${active ? "outline outline-[3px] outline-offset-2 outline-[#C8372D]" : "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#13233A]"}`}
                          >
                            <span className="font-mono text-[20px] font-semibold leading-none">{v}</span>
                            <span className="text-[12px] font-medium opacity-90">{lv.word}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-[12px] border border-[#D5DCE4] bg-white p-4" aria-live="polite">
            <p className="text-[15px] font-semibold text-[#13233A]">{phase}: {cat.toLowerCase()}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#3B4B62]">{note}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
