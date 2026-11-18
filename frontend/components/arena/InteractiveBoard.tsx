"use client";

import React, { useMemo, useState } from "react";
import { Chess, Square } from "chess.js";

interface InteractiveBoardProps {
  fen: string;
  orientation?: "white" | "black";
  lastMove?: [string, string] | null;
  interactive?: boolean;
  isCheck?: boolean;
  isCheckmate?: boolean;
  onMove?: (from: string, to: string) => void;
  className?: string;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

const GLYPH: Record<string, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

const PIECE_NAMES: Record<string, string> = {
  k: "King",
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
  p: "Pawn",
};

export default function InteractiveBoard({
  fen,
  orientation = "white",
  lastMove,
  interactive = true,
  isCheck = false,
  isCheckmate = false,
  onMove,
  className = "",
}: InteractiveBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [draggedSquare, setDraggedSquare] = useState<string | null>(null);

  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const turn = game.turn(); // 'w' or 'b'
  const isTurn = (orientation === "white" && turn === "w") || (orientation === "black" && turn === "b");

  // Determine legal destination squares for currently selected or dragged piece
  const activeSquare = selectedSquare || draggedSquare;
  const legalTargets = useMemo(() => {
    if (!activeSquare) return [] as string[];
    try {
      const moves = game.moves({ square: activeSquare as Square, verbose: true });
      return moves.map((m) => m.to as string);
    } catch {
      return [] as string[];
    }
  }, [activeSquare, game]);

  // Find king square for check/checkmate indicator
  const kingSquare = useMemo(() => {
    if (!isCheck && !isCheckmate) return null;
    const currentTurn = game.turn();
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (piece && piece.type === "k" && piece.color === currentTurn) {
          return `${FILES[f]}${8 - r}`;
        }
      }
    }
    return null;
  }, [game, isCheck, isCheckmate]);

  // Coordinate display based on orientation
  const displayedRanks = orientation === "white" ? RANKS : [...RANKS].reverse();
  const displayedFiles = orientation === "white" ? FILES : [...FILES].reverse();

  function handleSquareClick(sq: string, pieceColor: "w" | "b" | null) {
    if (!interactive) return;

    // If already selected a piece and clicked another square
    if (selectedSquare) {
      if (sq === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
      if (legalTargets.includes(sq)) {
        onMove?.(selectedSquare, sq);
        setSelectedSquare(null);
        return;
      }
    }

    // Select piece if it's the mover's piece and player's turn
    if (pieceColor && pieceColor === turn && isTurn) {
      setSelectedSquare(sq);
    } else {
      setSelectedSquare(null);
    }
  }

  function handleDragStart(e: React.DragEvent, sq: string, pieceColor: "w" | "b") {
    if (!interactive || !isTurn || pieceColor !== turn) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", sq);
    e.dataTransfer.effectAllowed = "move";
    setDraggedSquare(sq);
    setSelectedSquare(sq);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, targetSq: string) {
    e.preventDefault();
    const fromSq = e.dataTransfer.getData("text/plain") || draggedSquare;
    setDraggedSquare(null);

    if (fromSq && fromSq !== targetSq) {
      // Validate with chess.js
      try {
        const moves = game.moves({ square: fromSq as Square, verbose: true });
        if (moves.some((m) => m.to === targetSq)) {
          onMove?.(fromSq, targetSq);
          setSelectedSquare(null);
          return;
        }
      } catch {
        // ignore
      }
    }
    setSelectedSquare(null);
  }

  return (
    <div
      className={`relative aspect-square w-full select-none overflow-hidden rounded-2xl border-2 border-[#1E293B] bg-[#0F172A] p-2 sm:p-3 shadow-2xl shadow-black/60 ${className}`}
    >
      <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-xl border border-slate-700/60 shadow-inner">
        {displayedRanks.map((rank, ri) =>
          displayedFiles.map((file, fi) => {
            const sq = `${file}${rank}`;
            const fileIndex = FILES.indexOf(file);
            const rankIndex = parseInt(rank, 10);
            const isDark = (fileIndex + rankIndex) % 2 === 0;

            const piece = game.get(sq as Square);
            const isSelected = selectedSquare === sq;
            const isLastMove = lastMove && (lastMove[0] === sq || lastMove[1] === sq);
            const isLegalTarget = legalTargets.includes(sq);
            const isKingInCheck = kingSquare === sq;

            const pieceColor = piece ? piece.color : null;
            const canDrag = interactive && isTurn && pieceColor === turn;

            return (
              <div
                key={sq}
                onClick={() => handleSquareClick(sq, pieceColor)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, sq)}
                className={`relative flex items-center justify-center transition-colors duration-150 ${
                  isDark ? "bg-[#334155]" : "bg-[#64748B]/35"
                } ${canDrag ? "cursor-grab active:cursor-grabbing" : isLegalTarget ? "cursor-pointer" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${sq} ${piece ? `${piece.color === "w" ? "White" : "Black"} ${PIECE_NAMES[piece.type]}` : "Empty"}`}
              >
                {/* Last move highlight */}
                {isLastMove && (
                  <span className="absolute inset-0 bg-amber-400/35 transition-opacity" />
                )}

                {/* Selected square highlight */}
                {isSelected && (
                  <span className="absolute inset-0 bg-sky-500/40 ring-2 ring-inset ring-sky-400 transition-all" />
                )}

                {/* Check / Checkmate ruby red pulsing aura */}
                {isKingInCheck && (
                  <span
                    className={`absolute inset-0 ${
                      isCheckmate ? "bg-red-600/70" : "bg-red-500/50"
                    } animate-pulse ring-4 ring-inset ring-red-500`}
                  />
                )}

                {/* Legal Move indicator: dot on empty square, ring on capture */}
                {isLegalTarget && (
                  <>
                    {piece ? (
                      <span className="absolute inset-[8%] rounded-full border-[4px] border-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.5)] z-10 pointer-events-none" />
                    ) : (
                      <span className="absolute h-[28%] w-[28%] rounded-full bg-emerald-400/70 shadow-[0_0_8px_rgba(52,211,153,0.6)] z-10 pointer-events-none" />
                    )}
                  </>
                )}

                {/* Piece Rendering with Drag & Drop */}
                {piece && (
                  <div
                    draggable={canDrag}
                    onDragStart={(e) => handleDragStart(e, sq, piece.color)}
                    onDragEnd={() => setDraggedSquare(null)}
                    className="relative z-10 flex h-full w-full items-center justify-center select-none"
                  >
                    <span
                      className="font-chesspieces select-none text-[length:var(--board-piece-size,clamp(26px,5.8vw,52px))] transition-transform duration-100 hover:scale-105"
                      style={
                        piece.color === "w"
                          ? {
                              color: "#FFFFFF",
                              WebkitTextStroke: "1.4px #0F172A",
                              textShadow: "0 2px 8px rgba(0,0,0,0.45)",
                            }
                          : {
                              color: "#0F172A",
                              WebkitTextStroke: "1px #94A3B8",
                              textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                            }
                      }
                    >
                      {GLYPH[piece.type]}
                    </span>
                  </div>
                )}

                {/* Rank notation label */}
                {fi === 0 && (
                  <span
                    className={`bz-coord absolute left-1 top-0.5 text-[9px] sm:text-[10px] font-bold ${
                      isDark ? "text-slate-400/80" : "text-slate-300/80"
                    }`}
                  >
                    {rank}
                  </span>
                )}

                {/* File notation label */}
                {ri === 7 && (
                  <span
                    className={`bz-coord absolute bottom-0.5 right-1 text-[9px] sm:text-[10px] font-bold ${
                      isDark ? "text-slate-400/80" : "text-slate-300/80"
                    }`}
                  >
                    {file}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
