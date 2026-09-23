"use client";

import { useMemo, useState } from "react";
import { Chess, Square } from "chess.js";

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
}

interface BoardProps {
  fen: string;
  lastMove?: [string, string] | null;
  arrows?: BoardArrow[];
  interactive?: boolean;
  hintSquare?: string | null;
  onMove?: (from: string, to: string) => void;
  label: string; // accessible description of the position
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
// Solid glyphs for both sides; colour comes from CSS. U+FE0E forces text (not emoji) rendering.
const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const NAME: Record<string, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };

function center(sq: string) {
  const f = FILES.indexOf(sq[0]);
  const r = parseInt(sq[1], 10);
  return { x: f + 0.5, y: 8 - r + 0.5 };
}

export default function Board({ fen, lastMove, arrows = [], interactive = false, hintSquare, onMove, label }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const game = useMemo(() => new Chess(fen), [fen]);
  const rows = game.board();
  const targets = useMemo(() => {
    if (!selected) return [] as string[];
    return game.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string);
  }, [selected, game]);

  function handleClick(sq: string, hasOwnPiece: boolean) {
    if (!interactive) return;
    if (selected && sq !== selected && !hasOwnPiece) {
      onMove?.(selected, sq);
      setSelected(null);
      return;
    }
    if (hasOwnPiece) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  }

  const turn = game.turn();

  return (
    <div className="relative aspect-square w-full select-none overflow-hidden rounded-[6px] shadow-[0_1px_0_#c9d1db]">
      {!interactive && <span className="sr-only">{label}</span>}
      <div className="grid h-full w-full grid-cols-8 grid-rows-8" role={interactive ? "grid" : "img"} aria-label={interactive ? label : undefined} aria-hidden={interactive ? undefined : true}>
        {rows.map((row, ri) =>
          row.map((cell, fi) => {
            const sq = `${FILES[fi]}${8 - ri}`;
            const dark = (ri + fi) % 2 === 1;
            const isLast = lastMove && (lastMove[0] === sq || lastMove[1] === sq);
            const isSel = selected === sq;
            const isTarget = targets.includes(sq);
            const own = !!cell && cell.color === turn;
            const pieceName = cell ? `${cell.color === "w" ? "white" : "black"} ${NAME[cell.type]}` : "empty";
            const Tag = interactive ? "button" : "div";
            return (
              <Tag
                key={sq}
                {...(interactive ? { type: "button", onClick: () => handleClick(sq, own), "aria-label": `${sq}, ${pieceName}${isSel ? ", selected" : ""}` } : {})}
                className={[
                  "relative flex items-center justify-center leading-none outline-none",
                  dark ? "bg-[#8FA094]" : "bg-[#E9ECE4]",
                  interactive ? "cursor-pointer focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#13233A]" : "",
                ].join(" ")}
              >
                {isLast && <span className="absolute inset-0 bg-[#F2C94C]/45" />}
                {isSel && <span className="absolute inset-0 bg-[#13233A]/25" />}
                {hintSquare === sq && <span className="absolute inset-[6%] rounded-full border-[3px] border-[#1F7A4D]" />}
                {isTarget && (
                  <span className={cell ? "absolute inset-[4%] rounded-full border-[4px] border-[#13233A]/35" : "absolute h-[26%] w-[26%] rounded-full bg-[#13233A]/30"} />
                )}
                {cell && (
                  <span
                    className="relative font-chesspieces text-[clamp(22px,5.4vw,46px)]"
                    style={
                      cell.color === "w"
                        ? { color: "#FFFFFF", WebkitTextStroke: "1.3px #13233A", textShadow: "0 1px 0 rgba(19,35,58,.25)" }
                        : { color: "#13233A" }
                    }
                  >
                    {GLYPH[cell.type]}{"\uFE0E"}
                  </span>
                )}
                {fi === 0 && (
                  <span className={`absolute left-[4%] top-[3%] text-[10px] font-semibold ${dark ? "text-[#E9ECE4]" : "text-[#6E8175]"}`}>{8 - ri}</span>
                )}
                {ri === 7 && (
                  <span className={`absolute bottom-[2%] right-[5%] text-[10px] font-semibold ${dark ? "text-[#E9ECE4]" : "text-[#6E8175]"}`}>{FILES[fi]}</span>
                )}
              </Tag>
            );
          })
        )}
      </div>

      {arrows.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 8 8" aria-hidden="true">
          <defs>
            {arrows.map((a, i) => (
              <marker key={i} id={`ah-${i}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill={a.color} />
              </marker>
            ))}
          </defs>
          {arrows.map((a, i) => {
            const s = center(a.from);
            const e = center(a.to);
            const len = Math.hypot(e.x - s.x, e.y - s.y);
            const k = (len - 0.32) / len;
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={s.x + (e.x - s.x) * k}
                y2={s.y + (e.y - s.y) * k}
                stroke={a.color}
                strokeWidth={0.17}
                strokeLinecap="round"
                opacity={0.88}
                markerEnd={`url(#ah-${i})`}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}
