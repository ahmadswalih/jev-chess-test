/**
 * Deterministic chess work lives here.
 *
 * Rules, legal moves, material accounting, tactical annotation and the local
 * fallback engine are all plain code. Jev is never asked to know the rules --
 * it is only asked to judge between candidate moves that code already proved
 * legal and already described. That split is the whole point of building on a
 * System One model: code owns the workflow, the model supplies judgment.
 */

import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const CENTER = new Set<Square>(["d4", "e4", "d5", "e5"]);
const EXTENDED_CENTER = new Set<Square>([
  "c3", "d3", "e3", "f3",
  "c4", "d4", "e4", "f4",
  "c5", "d5", "e5", "f5",
  "c6", "d6", "e6", "f6",
]);

/** Pawn-unit piece-square nudges, from white's point of view. */
const PST: Partial<Record<PieceSymbol, number[]>> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    0.1, 0.1, 0.2, 0.3, 0.3, 0.2, 0.1, 0.1,
    0.05, 0.05, 0.1, 0.27, 0.27, 0.1, 0.05, 0.05,
    0, 0, 0, 0.25, 0.25, 0, 0, 0,
    0.05, -0.05, -0.1, 0, 0, -0.1, -0.05, 0.05,
    0.05, 0.1, 0.1, -0.25, -0.25, 0.1, 0.1, 0.05,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -0.5, -0.4, -0.3, -0.3, -0.3, -0.3, -0.4, -0.5,
    -0.4, -0.2, 0, 0, 0, 0, -0.2, -0.4,
    -0.3, 0, 0.1, 0.15, 0.15, 0.1, 0, -0.3,
    -0.3, 0.05, 0.15, 0.2, 0.2, 0.15, 0.05, -0.3,
    -0.3, 0, 0.15, 0.2, 0.2, 0.15, 0, -0.3,
    -0.3, 0.05, 0.1, 0.15, 0.15, 0.1, 0.05, -0.3,
    -0.4, -0.2, 0, 0.05, 0.05, 0, -0.2, -0.4,
    -0.5, -0.4, -0.3, -0.3, -0.3, -0.3, -0.4, -0.5,
  ],
  b: [
    -0.2, -0.1, -0.1, -0.1, -0.1, -0.1, -0.1, -0.2,
    -0.1, 0, 0, 0, 0, 0, 0, -0.1,
    -0.1, 0, 0.05, 0.1, 0.1, 0.05, 0, -0.1,
    -0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, -0.1,
    -0.1, 0, 0.1, 0.1, 0.1, 0.1, 0, -0.1,
    -0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, -0.1,
    -0.1, 0.05, 0, 0, 0, 0, 0.05, -0.1,
    -0.2, -0.1, -0.1, -0.1, -0.1, -0.1, -0.1, -0.2,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    0.05, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.05,
    -0.05, 0, 0, 0, 0, 0, 0, -0.05,
    -0.05, 0, 0, 0, 0, 0, 0, -0.05,
    -0.05, 0, 0, 0, 0, 0, 0, -0.05,
    -0.05, 0, 0, 0, 0, 0, 0, -0.05,
    -0.05, 0, 0, 0, 0, 0, 0, -0.05,
    0, 0, 0, 0.05, 0.05, 0, 0, 0,
  ],
  q: [
    -0.2, -0.1, -0.1, -0.05, -0.05, -0.1, -0.1, -0.2,
    -0.1, 0, 0, 0, 0, 0, 0, -0.1,
    -0.1, 0, 0.05, 0.05, 0.05, 0.05, 0, -0.1,
    -0.05, 0, 0.05, 0.05, 0.05, 0.05, 0, -0.05,
    0, 0, 0.05, 0.05, 0.05, 0.05, 0, -0.05,
    -0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0, -0.1,
    -0.1, 0, 0.05, 0, 0, 0, 0, -0.1,
    -0.2, -0.1, -0.1, -0.05, -0.05, -0.1, -0.1, -0.2,
  ],
  k: [
    -0.3, -0.4, -0.4, -0.5, -0.5, -0.4, -0.4, -0.3,
    -0.3, -0.4, -0.4, -0.5, -0.5, -0.4, -0.4, -0.3,
    -0.3, -0.4, -0.4, -0.5, -0.5, -0.4, -0.4, -0.3,
    -0.3, -0.4, -0.4, -0.5, -0.5, -0.4, -0.4, -0.3,
    -0.2, -0.3, -0.3, -0.4, -0.4, -0.3, -0.3, -0.2,
    -0.1, -0.2, -0.2, -0.2, -0.2, -0.2, -0.2, -0.1,
    0.2, 0.2, 0, 0, 0, 0, 0.2, 0.2,
    0.2, 0.3, 0.1, 0, 0, 0.1, 0.3, 0.2,
  ],
};

const FILES = "abcdefgh";

function squareIndex(square: Square, color: Color): number {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  // PST tables are written from white's perspective, rank 8 first.
  const row = color === "w" ? 8 - rank : rank - 1;
  const col = color === "w" ? file : 7 - file;
  return row * 8 + col;
}

/** Material balance in pawns, positive means `color` is ahead. */
export function material(chess: Chess, color: Color): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = PIECE_VALUE[piece.type];
      total += piece.color === color ? value : -value;
    }
  }
  return total;
}

/** Static evaluation in pawns, positive means `color` stands better. */
export function evaluate(chess: Chess, color: Color): number {
  if (chess.isCheckmate()) return chess.turn() === color ? -1000 : 1000;
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) return 0;

  let score = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const table = PST[piece.type];
      const positional = table ? table[squareIndex(piece.square, piece.color)] : 0;
      const value = PIECE_VALUE[piece.type] + positional;
      score += piece.color === color ? value : -value;
    }
  }
  return score;
}

export interface MoveFeature {
  /** Stable id used as the Choice option key. */
  id: string;
  san: string;
  uci: string;
  from: Square;
  to: Square;
  piece: string;
  captures: string | null;
  promotesTo: string | null;
  isCastle: boolean;
  isEnPassant: boolean;
  givesCheck: boolean;
  isCheckmate: boolean;
  /** Material for the mover right after the move, in pawns. */
  materialAfter: number;
  /** Material for the mover after the opponent's most damaging single reply. */
  materialAfterBestReply: number;
  /** Material the opponent wins back immediately, in pawns. */
  opponentCanWin: number;
  opponentMatesInOne: boolean;
  /** Destination square is attacked by the opponent after the move. */
  landsOnAttackedSquare: boolean;
  /** Destination square is defended by our own pieces after the move. */
  landsOnDefendedSquare: boolean;
  /** The piece being moved was attacked and undefended before the move. */
  rescuesHangingPiece: boolean;
  /** Moves into or through the four central squares. */
  takesCentre: boolean;
  /** Brings a knight or bishop off its starting rank for the first time. */
  develops: boolean;
  /** Repeats a position that already occurred in the game. */
  repeats: boolean;
  /** Local heuristic score in pawns; used for shortlisting and as fallback. */
  localScore: number;
}

function uciOf(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/**
 * Cheapest useful tactical read: after our move, what is the single best thing
 * the opponent can do to us? One ply, but it catches hanging pieces and mate
 * in one, which is most of what decides a blitz game.
 */
function opponentBestReply(chess: Chess, mover: Color): {
  material: number;
  gain: number;
  mateInOne: boolean;
} {
  const before = material(chess, mover);
  const replies = chess.moves({ verbose: true }) as Move[];

  if (replies.length === 0) {
    return { material: before, gain: 0, mateInOne: false };
  }

  let worst = before;
  let mateInOne = false;

  for (const reply of replies) {
    chess.move(reply);
    if (chess.isCheckmate()) mateInOne = true;
    const after = material(chess, mover);
    if (after < worst) worst = after;
    chess.undo();
    if (mateInOne) break;
  }

  return { material: worst, gain: before - worst, mateInOne };
}

/**
 * Annotate every legal move for `chess.turn()` with the facts a player would
 * notice at a glance. These annotations become the rubric Jev reads.
 */
export function annotateMoves(chess: Chess): MoveFeature[] {
  const mover = chess.turn();
  const opponent: Color = mover === "w" ? "b" : "w";
  const legal = chess.moves({ verbose: true }) as Move[];
  const history = new Set<string>();
  for (const past of chess.history({ verbose: true }) as Move[]) {
    history.add(past.after.split(" ").slice(0, 4).join(" "));
  }

  const features: MoveFeature[] = [];

  legal.forEach((move, index) => {
    const wasAttacked = chess.isAttacked(move.from, opponent);
    const wasDefended = chess.attackers(move.from, mover).length > 1;

    chess.move(move);

    const isCheckmate = chess.isCheckmate();
    const givesCheck = chess.inCheck();
    const materialAfter = material(chess, mover);
    const landsOnAttackedSquare = chess.isAttacked(move.to, opponent);
    const landsOnDefendedSquare = chess.attackers(move.to, mover).length > 0;
    const positionKey = chess.fen().split(" ").slice(0, 4).join(" ");

    const reply = isCheckmate
      ? { material: materialAfter, gain: 0, mateInOne: false }
      : opponentBestReply(chess, mover);

    const positional = evaluate(chess, mover) - materialAfter;

    chess.undo();

    const movedValue = PIECE_VALUE[move.piece];
    const takesCentre = CENTER.has(move.to as Square);
    const develops =
      (move.piece === "n" || move.piece === "b") &&
      move.from[1] === (mover === "w" ? "1" : "8");

    let localScore = reply.material + positional;
    if (isCheckmate) localScore = 1000;
    if (reply.mateInOne) localScore = -1000;
    if (takesCentre) localScore += 0.15;
    if (EXTENDED_CENTER.has(move.to as Square)) localScore += 0.05;
    if (develops) localScore += 0.2;
    if (move.flags.includes("k") || move.flags.includes("q")) localScore += 0.35;
    if (givesCheck && !isCheckmate) localScore += 0.1;
    if (history.has(positionKey)) localScore -= 0.4;
    if (move.piece === "k" && !move.flags.includes("k") && !move.flags.includes("q")) {
      localScore -= 0.2;
    }

    features.push({
      id: `m${index + 1}`,
      san: move.san,
      uci: uciOf(move),
      from: move.from as Square,
      to: move.to as Square,
      piece: PIECE_NAME[move.piece],
      captures: move.captured ? PIECE_NAME[move.captured] : null,
      promotesTo: move.promotion ? PIECE_NAME[move.promotion] : null,
      isCastle: move.flags.includes("k") || move.flags.includes("q"),
      isEnPassant: move.flags.includes("e"),
      givesCheck: givesCheck && !isCheckmate,
      isCheckmate,
      materialAfter: round(materialAfter),
      materialAfterBestReply: round(reply.material),
      opponentCanWin: round(reply.gain),
      opponentMatesInOne: reply.mateInOne,
      landsOnAttackedSquare,
      landsOnDefendedSquare,
      rescuesHangingPiece: wasAttacked && !wasDefended && movedValue >= 3,
      takesCentre,
      develops,
      repeats: history.has(positionKey),
      localScore: round(localScore),
    });
  });

  return features;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Local fallback engine: depth-2 negamax over the annotated shortlist.
 *
 * It plays whenever Jev is unreachable, out of time, or not configured, so a
 * game never stalls on a network hiccup. It is deliberately modest -- the
 * interesting opponent is Jev.
 */
export function fallbackMove(chess: Chess, features: MoveFeature[]): MoveFeature {
  const ranked = [...features].sort((a, b) => b.localScore - a.localScore);
  const top = ranked.slice(0, 6);
  if (top.length <= 1) return ranked[0];

  const mover = chess.turn();
  let best = top[0];
  let bestScore = -Infinity;

  for (const candidate of top) {
    chess.move(candidate.san);
    const score = -negamax(chess, 1, -Infinity, Infinity, mover === "w" ? "b" : "w");
    chess.undo();
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number, side: Color): number {
  if (depth === 0 || chess.isGameOver()) return evaluate(chess, side);

  const moves = (chess.moves({ verbose: true }) as Move[])
    .sort((a, b) => captureValue(b) - captureValue(a))
    .slice(0, 12);

  let best = -Infinity;
  for (const move of moves) {
    chess.move(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha, side === "w" ? "b" : "w");
    chess.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? evaluate(chess, side) : best;
}

function captureValue(move: Move): number {
  return move.captured ? PIECE_VALUE[move.captured] : 0;
}

/**
 * Narrow the legal moves down to the handful worth a judgment call.
 *
 * Jev can take up to 255 Choice options, but a 1+0 clock cannot: fewer, better
 * described options means fewer tokens and a faster reply. Forcing moves are
 * always kept so a mate or a free queen is never filtered away.
 */
export function shortlist(features: MoveFeature[], limit = 14): MoveFeature[] {
  if (features.length <= limit) return features;

  const mate = features.filter((f) => f.isCheckmate);
  if (mate.length > 0) return mate.slice(0, 1);

  const forcing = features.filter(
    (f) => f.givesCheck || (f.captures !== null && f.opponentCanWin < 2) || f.promotesTo,
  );
  const rest = [...features].sort((a, b) => b.localScore - a.localScore);

  const picked = new Map<string, MoveFeature>();
  for (const f of forcing.slice(0, Math.ceil(limit / 2))) picked.set(f.id, f);
  for (const f of rest) {
    if (picked.size >= limit) break;
    picked.set(f.id, f);
  }

  return [...picked.values()];
}

export interface PositionSummary {
  fen: string;
  moveNumber: number;
  sideToMove: "white" | "black";
  inCheck: boolean;
  materialBalance: number;
  phase: "opening" | "middlegame" | "endgame";
  recentMoves: string[];
}

export function summarisePosition(chess: Chess, perspective: Color): PositionSummary {
  const history = chess.history();
  const pieces = chess
    .board()
    .flat()
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const heavy = pieces.filter((p) => p.type !== "p" && p.type !== "k").length;

  return {
    fen: chess.fen(),
    moveNumber: chess.moveNumber(),
    sideToMove: chess.turn() === "w" ? "white" : "black",
    inCheck: chess.inCheck(),
    materialBalance: round(material(chess, perspective)),
    phase: history.length < 16 ? "opening" : heavy <= 6 ? "endgame" : "middlegame",
    recentMoves: history.slice(-10),
  };
}

export { Chess };
export type { Color, Move, Square, PieceSymbol };
