"use client";

import { pieceSrc } from "./pieces";
import type { Color, PieceSymbol } from "chess.js";

/** mm:ss normally; tenths under ten seconds, where the game is usually decided. */
export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 10_000) return (Math.floor(safe / 100) / 10).toFixed(1);
  const total = Math.ceil(safe / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

interface Props {
  name: string;
  subtitle: string;
  avatar: string;
  ms: number;
  active: boolean;
  captured: string[];
  /** Material edge in pawns; only shown when positive. */
  edge: number;
  colour: Color;
}

export default function ClockRow({
  name,
  subtitle,
  avatar,
  ms,
  active,
  captured,
  edge,
  colour,
}: Props) {
  return (
    <div className="clock-row" data-active={active} data-danger={ms < 10_000}>
      <div className="clock-id">
        <span className="clock-avatar" aria-hidden>
          {avatar}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="clock-name">{name}</div>
          <div className="clock-sub">
            {captured.length > 0 ? (
              <span className="captured">
                {captured.map((type, index) => (
                  <img
                    key={`${type}-${index}`}
                    src={pieceSrc(colour, type as PieceSymbol)}
                    alt=""
                    draggable={false}
                    aria-hidden
                  />
                ))}
                {edge > 0 && <span className="captured-edge">+{edge}</span>}
              </span>
            ) : (
              subtitle
            )}
          </div>
        </div>
      </div>
      <div className="clock-time" aria-label={`${name} clock`}>
        {formatClock(ms)}
      </div>
    </div>
  );
}
