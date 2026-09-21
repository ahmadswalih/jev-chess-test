import { NextResponse } from "next/server";
import { chooseMove, type Difficulty } from "@/lib/jev";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MoveRequest {
  fen?: unknown;
  history?: unknown;
  difficulty?: unknown;
  clock?: unknown;
}

export async function POST(request: Request) {
  let body: MoveRequest;
  try {
    body = (await request.json()) as MoveRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.fen !== "string" || body.fen.trim().length === 0) {
    return NextResponse.json({ error: "`fen` is required." }, { status: 400 });
  }

  const history = Array.isArray(body.history)
    ? body.history.filter((san): san is string => typeof san === "string").slice(0, 400)
    : undefined;

  const difficulty: Difficulty = body.difficulty === "raw" ? "raw" : "guarded";

  const rawClock = body.clock as { jevMs?: unknown; humanMs?: unknown } | undefined;
  const clock = {
    jevMs: clamp(rawClock?.jevMs, 0, 60_000),
    humanMs: clamp(rawClock?.humanMs, 0, 60_000),
  };

  try {
    const move = await chooseMove({ fen: body.fen, history, difficulty, clock });
    return NextResponse.json(move, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jev could not pick a move.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

function clamp(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : max;
  return Math.min(max, Math.max(min, n));
}
