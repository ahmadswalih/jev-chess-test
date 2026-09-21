"use client";

/**
 * The board.
 *
 * Handles both input styles, because a blitz game has to work on a phone as
 * well as a laptop: tap a piece then tap a destination, or drag the piece.
 * Sizing is entirely fluid -- the board is a square grid that fills whatever
 * width it is given, and every visual detail is a percentage of that.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Color, PieceSymbol } from "chess.js";
import { PIECE_LABEL, pieceAlt, pieceSrc } from "./pieces";

export interface BoardPiece {
  square: string;
  type: PieceSymbol;
  color: Color;
}

export interface SimpleMove {
  from: string;
  to: string;
  promotion?: string;
  captured?: string;
}

interface Props {
  board: (BoardPiece | null)[][];
  orientation: Color;
  /** Legal moves for the side the human is allowed to move right now. */
  moves: SimpleMove[];
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  onMove: (from: string, to: string, promotion?: string) => void;
  disabled?: boolean;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;
const PROMOTION_PIECES: PieceSymbol[] = ["q", "r", "b", "n"];

export default function ChessBoard({
  board,
  orientation,
  moves,
  lastMove,
  checkSquare,
  onMove,
  disabled = false,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: string; x: number; y: number } | null>(null);
  const [pending, setPending] = useState<{ from: string; to: string; colour: Color } | null>(null);
  const pointerStart = useRef<{ x: number; y: number; square: string } | null>(null);

  /** from-square -> destination squares, rebuilt whenever the position changes. */
  const movesByFrom = useMemo(() => {
    const map = new Map<string, SimpleMove[]>();
    for (const move of moves) {
      const list = map.get(move.from);
      if (list) list.push(move);
      else map.set(move.from, [move]);
    }
    return map;
  }, [moves]);

  const targets = useMemo(() => {
    if (!selected) return new Map<string, SimpleMove>();
    const map = new Map<string, SimpleMove>();
    for (const move of movesByFrom.get(selected) ?? []) {
      if (!map.has(move.to)) map.set(move.to, move);
    }
    return map;
  }, [selected, movesByFrom]);

  // Clear any stale selection when the position or turn changes.
  useEffect(() => {
    if (disabled) {
      setSelected(null);
      setDrag(null);
    }
  }, [disabled]);

  const pieceAt = useCallback(
    (square: string): BoardPiece | null => {
      for (const row of board) {
        for (const piece of row) {
          if (piece?.square === square) return piece;
        }
      }
      return null;
    },
    [board],
  );

  const commit = useCallback(
    (from: string, to: string) => {
      const options = (movesByFrom.get(from) ?? []).filter((move) => move.to === to);
      if (options.length === 0) return false;

      const needsPromotion = options.some((move) => move.promotion);
      if (needsPromotion) {
        const colour = pieceAt(from)?.color ?? orientation;
        setPending({ from, to, colour });
        setSelected(null);
        return true;
      }

      onMove(from, to);
      setSelected(null);
      return true;
    },
    [movesByFrom, onMove, orientation, pieceAt],
  );

  const squareFromPoint = useCallback((x: number, y: number): string | null => {
    const element = document.elementFromPoint(x, y);
    const square = element?.closest<HTMLElement>("[data-square]");
    return square?.dataset.square ?? null;
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || pending) return;
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-square]");
      const square = target?.dataset.square;
      if (!square) return;

      // Completing a tap-to-move.
      if (selected && selected !== square && targets.has(square)) {
        event.preventDefault();
        commit(selected, square);
        return;
      }

      if (!movesByFrom.has(square)) {
        setSelected(null);
        return;
      }

      event.preventDefault();
      pointerStart.current = { x: event.clientX, y: event.clientY, square };
      setSelected(square);
      boardRef.current?.setPointerCapture?.(event.pointerId);
    },
    [commit, disabled, movesByFrom, pending, selected, targets],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerStart.current;
      if (!start) return;

      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (!drag && moved < 7) return;

      event.preventDefault();
      setDrag({ from: start.square, x: event.clientX, y: event.clientY });
    },
    [drag],
  );

  const endPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerStart.current;
      pointerStart.current = null;
      boardRef.current?.releasePointerCapture?.(event.pointerId);

      if (!start || !drag) {
        setDrag(null);
        return; // A plain tap: the selection made in pointerdown stands.
      }

      const dropped = squareFromPoint(event.clientX, event.clientY);
      setDrag(null);

      if (dropped && dropped !== start.square) {
        const moved = commit(start.square, dropped);
        if (!moved) setSelected(start.square);
      }
    },
    [commit, drag, squareFromPoint],
  );

  const rows = orientation === "w" ? board : [...board].slice().reverse();
  const dragPiece = drag ? pieceAt(drag.from) : null;

  const squareSize = boardRef.current
    ? boardRef.current.getBoundingClientRect().width / 8
    : 48;

  return (
    <div className="board-frame">
      <div
        ref={boardRef}
        className="board"
        role="grid"
        aria-label="Chess board"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {rows.map((row, rowIndex) => {
          const ordered = orientation === "w" ? row : [...row].slice().reverse();
          return ordered.map((piece, colIndex) => {
            const file = orientation === "w" ? FILES[colIndex] : FILES[7 - colIndex];
            const rank = orientation === "w" ? RANKS[rowIndex] : RANKS[7 - rowIndex];
            const square = `${file}${rank}`;
            const shade = (FILES.indexOf(file) + Number(rank)) % 2 === 0 ? "dark" : "light";
            const target = targets.get(square);
            const isLast = lastMove?.from === square || lastMove?.to === square;

            return (
              <div
                key={square}
                className="square"
                data-square={square}
                data-shade={shade}
                data-selected={selected === square}
                data-last={isLast}
                data-check={checkSquare === square}
                data-playable={!disabled && (movesByFrom.has(square) || targets.has(square))}
                role="gridcell"
                aria-label={piece ? `${square}, ${pieceAlt(piece.color, piece.type)}` : square}
              >
                {colIndex === 0 && (
                  <span className="square-coord" data-kind="rank" aria-hidden>
                    {rank}
                  </span>
                )}
                {rowIndex === 7 && (
                  <span className="square-coord" data-kind="file" aria-hidden>
                    {file}
                  </span>
                )}
                {piece && (
                  <img
                    className="piece"
                    src={pieceSrc(piece.color, piece.type)}
                    alt=""
                    draggable={false}
                    data-dragging={drag?.from === square}
                    aria-hidden
                  />
                )}
                {target && <span className="hint" data-capture={Boolean(piece || target.captured)} aria-hidden />}
              </div>
            );
          });
        })}
      </div>

      {drag && dragPiece && (
        <img
          className="drag-layer"
          src={pieceSrc(dragPiece.color, dragPiece.type)}
          alt=""
          draggable={false}
          style={{
            left: drag.x,
            top: drag.y,
            width: `${squareSize}px`,
            height: `${squareSize}px`,
          }}
          aria-hidden
        />
      )}

      {pending && (
        <div className="board-overlay">
          <div>
            <p style={{ marginTop: 0, marginBottom: 12, fontSize: 14, color: "var(--text-muted)" }}>
              Promote to
            </p>
            <div className="promotion">
              {PROMOTION_PIECES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onMove(pending.from, pending.to, type);
                    setPending(null);
                  }}
                  aria-label={`Promote to ${PIECE_LABEL[type]}`}
                >
                  <img src={pieceSrc(pending.colour, type)} alt="" draggable={false} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
