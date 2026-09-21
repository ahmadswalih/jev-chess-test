"use client";

/**
 * Game state machine for a 1 + 0 blitz game against Jev.
 *
 * The clock is the interesting part. Both sides get exactly 60 seconds and no
 * increment, and Jev's thinking time comes out of Jev's own clock -- a slow
 * decision costs it real time, exactly as it would a human. The ticker only
 * ever drains the clock of the side to move, so nothing special is needed to
 * make that true.
 */

import { Chess, type Color, type Move } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Difficulty,
  GameResult,
  JevMoveResult,
  ReviewResult,
  Termination,
} from "@/lib/types";
import type { BoardPiece, SimpleMove } from "@/components/ChessBoard";

export const START_MS = 60_000;

export type Phase = "idle" | "playing" | "over";

export interface Outcome {
  result: GameResult;
  termination: Termination;
  headline: string;
  detail: string;
}

interface Snapshot {
  fen: string;
  board: (BoardPiece | null)[][];
  turn: Color;
  history: string[];
  moves: SimpleMove[];
  checkSquare: string | null;
}

function snapshot(chess: Chess, humanColour: Color, phase: Phase): Snapshot {
  const board = chess.board() as (BoardPiece | null)[][];
  const turn = chess.turn();

  const myTurn = phase === "playing" && turn === humanColour;
  const moves = myTurn
    ? (chess.moves({ verbose: true }) as Move[]).map((move) => ({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        captured: move.captured,
      }))
    : [];

  let checkSquare: string | null = null;
  if (chess.inCheck()) {
    for (const row of board) {
      for (const piece of row) {
        if (piece?.type === "k" && piece.color === turn) checkSquare = piece.square;
      }
    }
  }

  return { fen: chess.fen(), board, turn, history: chess.history(), moves, checkSquare };
}

export interface GameSettings {
  playerName: string;
  humanColour: Color;
  difficulty: Difficulty;
}

export function useChessGame(settings: GameSettings) {
  const chessRef = useRef(new Chess());
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);

  // Clock bookkeeping lives in a ref so the 100ms ticker never re-subscribes.
  const clockRef = useRef({ human: START_MS, jev: START_MS, updatedAt: 0 });

  const [phase, setPhase] = useState<Phase>("idle");
  const [view, setView] = useState<Snapshot>(() =>
    snapshot(chessRef.current, settings.humanColour, "idle"),
  );
  const [clock, setClock] = useState({ human: START_MS, jev: START_MS });
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [jev, setJev] = useState<JevMoveResult | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useRef({ jevMoves: 0, fallbacks: 0, latencyTotal: 0 });

  const humanColour = settings.humanColour;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const refresh = useCallback(
    (nextPhase: Phase) => {
      setView(snapshot(chessRef.current, settingsRef.current.humanColour, nextPhase));
    },
    [],
  );

  /** Finish the game, then send it to the leaderboard for recording + review. */
  const finish = useCallback(
    (result: GameResult, termination: Termination, headline: string, detail: string) => {
      if (submittedRef.current) return;
      submittedRef.current = true;

      abortRef.current?.abort();
      abortRef.current = null;

      setPhase("over");
      setThinking(false);
      setOutcome({ result, termination, headline, detail });
      refresh("over");

      const chess = chessRef.current;
      const { human, jev: jevMs } = clockRef.current;
      const body = {
        playerName: settingsRef.current.playerName,
        result,
        termination,
        humanColour: settingsRef.current.humanColour,
        history: chess.history(),
        durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
        humanTimeLeftMs: Math.max(0, Math.round(human)),
        jevTimeLeftMs: Math.max(0, Math.round(jevMs)),
        difficulty: settingsRef.current.difficulty,
        jevModel: null as string | null,
        jevMoveCount: stats.current.jevMoves,
        jevFallbackCount: stats.current.fallbacks,
        avgJevLatencyMs: stats.current.jevMoves
          ? stats.current.latencyTotal / stats.current.jevMoves
          : 0,
      };

      setReviewing(true);
      fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setReview(data?.review ?? null))
        .catch(() => setReview(null))
        .finally(() => setReviewing(false));
    },
    [refresh],
  );

  /** Translate a terminal position into a result. Returns true if the game ended. */
  const checkGameOver = useCallback((): boolean => {
    const chess = chessRef.current;
    if (!chess.isGameOver()) return false;

    const loser = chess.turn();
    const humanLost = loser === settingsRef.current.humanColour;

    if (chess.isCheckmate()) {
      finish(
        humanLost ? "jev" : "human",
        "checkmate",
        humanLost ? "Checkmate. Jev wins." : "Checkmate. You win.",
        humanLost
          ? "Jev found the mate before your clock ran out."
          : "You mated a decision model in under a minute.",
      );
      return true;
    }

    if (chess.isStalemate()) {
      finish("draw", "stalemate", "Stalemate.", "No legal moves, but no check either.");
      return true;
    }

    if (chess.isInsufficientMaterial()) {
      finish("draw", "draw", "Draw.", "Neither side has enough material to mate.");
      return true;
    }

    if (chess.isThreefoldRepetition()) {
      finish("draw", "draw", "Draw.", "The same position occurred three times.");
      return true;
    }

    finish("draw", "draw", "Draw.", "Fifty moves passed with no capture and no pawn move.");
    return true;
  }, [finish]);

  /** Ask the server for Jev's move and play it. */
  const requestJevMove = useCallback(async () => {
    const chess = chessRef.current;
    if (chess.isGameOver()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setThinking(true);
    setError(null);

    try {
      const response = await fetch("/api/jev/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: chess.fen(),
          history: chess.history(),
          difficulty: settingsRef.current.difficulty,
          clock: {
            jevMs: Math.max(0, Math.round(clockRef.current.jev)),
            humanMs: Math.max(0, Math.round(clockRef.current.human)),
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error((await response.json())?.error ?? "Jev is unavailable.");

      const move = (await response.json()) as JevMoveResult;

      // The clock may have run out while we waited; the ticker owns that call.
      if (submittedRef.current) return;

      chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion ?? undefined,
      });

      stats.current.jevMoves += 1;
      stats.current.latencyTotal += move.latencyMs;
      if (move.source === "fallback") stats.current.fallbacks += 1;

      setJev(move);
      setLastMove({ from: move.from, to: move.to });
      setThinking(false);
      refresh("playing");
      checkGameOver();
    } catch (caught) {
      if (controller.signal.aborted) return;
      setThinking(false);
      setError(caught instanceof Error ? caught.message : "Jev could not answer.");
    }
  }, [checkGameOver, refresh]);

  /** Play a human move. Returns false when the move is not available. */
  const playMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (phase !== "playing" || thinking) return false;
      const chess = chessRef.current;
      if (chess.turn() !== settingsRef.current.humanColour) return false;

      try {
        chess.move({ from, to, promotion });
      } catch {
        return false;
      }

      setLastMove({ from, to });
      refresh("playing");
      if (!checkGameOver()) void requestJevMove();
      return true;
    },
    [checkGameOver, phase, refresh, requestJevMove, thinking],
  );

  const start = useCallback((colour?: Color) => {
    if (colour) settingsRef.current = { ...settingsRef.current, humanColour: colour };
    abortRef.current?.abort();
    chessRef.current = new Chess();
    clockRef.current = { human: START_MS, jev: START_MS, updatedAt: Date.now() };
    stats.current = { jevMoves: 0, fallbacks: 0, latencyTotal: 0 };
    submittedRef.current = false;
    startedAtRef.current = Date.now();

    setClock({ human: START_MS, jev: START_MS });
    setLastMove(null);
    setJev(null);
    setOutcome(null);
    setReview(null);
    setError(null);
    setThinking(false);
    setPhase("playing");
    refresh("playing");

    if (settingsRef.current.humanColour === "b") void requestJevMove();
  }, [refresh, requestJevMove]);

  const resign = useCallback(() => {
    if (phase !== "playing") return;
    finish("jev", "resignation", "You resigned.", "Jev takes the point.");
  }, [finish, phase]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    chessRef.current = new Chess();
    submittedRef.current = false;
    clockRef.current = { human: START_MS, jev: START_MS, updatedAt: 0 };
    setClock({ human: START_MS, jev: START_MS });
    setPhase("idle");
    setOutcome(null);
    setReview(null);
    setJev(null);
    setLastMove(null);
    setError(null);
    setThinking(false);
    refresh("idle");
  }, [refresh]);

  // The clock. One interval for the whole game, draining only the side to move.
  useEffect(() => {
    if (phase !== "playing") return;

    clockRef.current.updatedAt = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - clockRef.current.updatedAt;
      clockRef.current.updatedAt = now;

      const turn = chessRef.current.turn();
      const humanColourNow = settingsRef.current.humanColour;

      if (turn === humanColourNow) {
        clockRef.current.human = Math.max(0, clockRef.current.human - elapsed);
      } else {
        clockRef.current.jev = Math.max(0, clockRef.current.jev - elapsed);
      }

      setClock({ human: clockRef.current.human, jev: clockRef.current.jev });

      const jevColour: Color = humanColourNow === "w" ? "b" : "w";

      if (clockRef.current.human <= 0) {
        // Flagging is only a loss if the other side could actually mate.
        hasMatingMaterial(chessRef.current, jevColour)
          ? finish("jev", "timeout", "Out of time.", "Your flag fell. Jev still had time on the clock.")
          : finish("draw", "timeout", "Draw on time.", "Your flag fell, but Jev cannot mate with what is left.");
      } else if (clockRef.current.jev <= 0) {
        hasMatingMaterial(chessRef.current, humanColourNow)
          ? finish("human", "timeout", "Jev flagged. You win.", "Jev ran out of clock before you did.")
          : finish("draw", "timeout", "Draw on time.", "Jev flagged, but you cannot mate with what is left.");
      }
    }, 100);

    return () => window.clearInterval(id);
  }, [finish, phase]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const captured = useMemo(() => countCaptured(view.history), [view.history]);

  return {
    phase,
    view,
    clock,
    lastMove,
    thinking,
    jev,
    outcome,
    review,
    reviewing,
    error,
    captured,
    humanColour,
    isHumanTurn: phase === "playing" && view.turn === humanColour,
    start,
    reset,
    resign,
    playMove,
  };
}

/**
 * Can `colour` still force mate with the material on the board? A lone king,
 * or a king and one minor piece, cannot -- so the opponent flagging is a draw
 * rather than a win.
 */
function hasMatingMaterial(chess: Chess, colour: Color): boolean {
  const pieces = chess
    .board()
    .flat()
    .filter((piece): piece is NonNullable<typeof piece> => piece?.color === colour);

  if (pieces.some((piece) => piece.type === "p" || piece.type === "r" || piece.type === "q")) {
    return true;
  }
  return pieces.filter((piece) => piece.type === "n" || piece.type === "b").length >= 2;
}

/** Material each side has captured, derived by replaying the move list. */
function countCaptured(history: string[]) {
  const chess = new Chess();
  const white: string[] = [];
  const black: string[] = [];
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let balance = 0;

  for (const san of history) {
    let move: Move | null = null;
    try {
      move = chess.move(san);
    } catch {
      break;
    }
    if (!move?.captured) continue;
    const value = values[move.captured] ?? 0;
    if (move.color === "w") {
      white.push(move.captured);
      balance += value;
    } else {
      black.push(move.captured);
      balance -= value;
    }
  }

  return { white, black, balance };
}
