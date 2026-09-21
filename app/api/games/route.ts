import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Chess } from "@/lib/chess-core";
import { readLeaderboard, saveGame } from "@/lib/db";
import { reviewLoss } from "@/lib/review";
import type { GameResult, Termination } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMINATIONS: Termination[] = [
  "checkmate",
  "timeout",
  "resignation",
  "stalemate",
  "draw",
  "abandoned",
];

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 10);
  const board = readLeaderboard(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10);
  return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
}

interface SubmitBody {
  playerName?: unknown;
  result?: unknown;
  termination?: unknown;
  humanColour?: unknown;
  history?: unknown;
  durationMs?: unknown;
  humanTimeLeftMs?: unknown;
  jevTimeLeftMs?: unknown;
  difficulty?: unknown;
  jevModel?: unknown;
  jevMoveCount?: unknown;
  jevFallbackCount?: unknown;
  avgJevLatencyMs?: unknown;
}

export async function POST(request: Request) {
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = body.result;
  if (result !== "jev" && result !== "human" && result !== "draw") {
    return NextResponse.json({ error: "`result` must be jev, human or draw." }, { status: 400 });
  }

  const termination = body.termination as Termination;
  if (!TERMINATIONS.includes(termination)) {
    return NextResponse.json({ error: "Unknown `termination`." }, { status: 400 });
  }

  const humanColour = body.humanColour === "b" ? "b" : "w";
  const history = Array.isArray(body.history)
    ? body.history.filter((san): san is string => typeof san === "string").slice(0, 400)
    : [];

  // Replay the game server-side. A result the moves do not support is rejected,
  // so the leaderboard reflects games that were actually played.
  const chess = new Chess();
  for (const san of history) {
    try {
      chess.move(san);
    } catch {
      return NextResponse.json({ error: `Illegal move in history: ${san}` }, { status: 422 });
    }
  }

  const verification = verifyResult(chess, result as GameResult, termination, humanColour);
  if (verification) return NextResponse.json({ error: verification }, { status: 422 });

  const review =
    result === "jev"
      ? await reviewLoss({
          pgn: chess.pgn(),
          history,
          humanColour,
          termination,
          humanTimeLeftMs: numberOr(body.humanTimeLeftMs, 0),
          jevTimeLeftMs: numberOr(body.jevTimeLeftMs, 0),
          finalFen: chess.fen(),
        })
      : null;

  const id = randomUUID();

  saveGame({
    id,
    playerName: cleanName(body.playerName),
    playedAt: new Date().toISOString(),
    result: result as GameResult,
    termination,
    humanColour,
    moveCount: history.length,
    durationMs: numberOr(body.durationMs, 0),
    humanTimeLeftMs: numberOr(body.humanTimeLeftMs, 0),
    jevTimeLeftMs: numberOr(body.jevTimeLeftMs, 0),
    pgn: chess.pgn(),
    finalFen: chess.fen(),
    difficulty: body.difficulty === "raw" ? "raw" : "guarded",
    jevModel: typeof body.jevModel === "string" ? body.jevModel.slice(0, 64) : null,
    lossReason: review?.reason ?? null,
    lossReasonConfidence: review?.confidence ?? null,
    lossSummary: review?.summary ?? null,
    blunderCount: review?.blunders.length ?? 0,
    jevMoveCount: numberOr(body.jevMoveCount, 0),
    jevFallbackCount: numberOr(body.jevFallbackCount, 0),
    avgJevLatencyMs: Math.round(numberOr(body.avgJevLatencyMs, 0)) || null,
  });

  return NextResponse.json({ id, review });
}

/** Returns an error message when the moves contradict the claimed result. */
function verifyResult(
  chess: Chess,
  result: GameResult,
  termination: Termination,
  humanColour: "w" | "b",
): string | null {
  const loser = chess.turn(); // side to move is the side that was mated or stalemated

  if (termination === "checkmate") {
    if (!chess.isCheckmate()) return "Claimed checkmate but the final position is not mate.";
    const expected: GameResult = loser === humanColour ? "jev" : "human";
    if (result !== expected) return "Checkmate result does not match the final position.";
  }

  if (termination === "stalemate") {
    if (!chess.isStalemate()) return "Claimed stalemate but the final position is not stalemate.";
    if (result !== "draw") return "Stalemate must be recorded as a draw.";
  }

  if (termination === "draw" && result !== "draw") {
    return "A drawn termination must be recorded as a draw.";
  }

  if (termination === "resignation" && result === "draw") {
    return "A resignation cannot be a draw.";
  }

  // Timeouts and abandonment cannot be proven from the moves alone, so they are
  // taken at face value.
  return null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "Anonymous";
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, 24);
  return trimmed.length > 0 ? trimmed : "Anonymous";
}
