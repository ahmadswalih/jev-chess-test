/**
 * Jev plays chess.
 *
 * Jev is a System One model: it does not generate moves, it *judges* between
 * options. So the workflow is:
 *
 *   1. code generates every legal move                     (chess-core)
 *   2. code annotates each one with the facts a player sees (chess-core)
 *   3. code shortlists the ones worth deciding between      (chess-core)
 *   4. Jev picks one, and rates the position alongside it   (here)
 *   5. code plays the pick and keeps the distribution       (here)
 *
 * Every question in a turn is asked in a single request. Jev evaluates them in
 * parallel against one state, which is both cheaper and faster than separate
 * calls -- and on a 1+0 clock, latency is the whole game.
 */

import {
  annotateMoves,
  Chess,
  fallbackMove,
  shortlist,
  summarisePosition,
  type Color,
  type MoveFeature,
} from "./chess-core";
import {
  asChoice,
  asNoul,
  asScore,
  isConfigured,
  systemOne,
  type ChoiceQuestion,
  type Description,
  type JsonValue,
  type NoulQuestion,
  type Question,
  type ScoreQuestion,
} from "./decisions";
import type { Difficulty, JevMoveResult } from "./types";

export type { Difficulty, JevMoveResult };

const MOVE_INSTRUCTIONS = {
  task:
    "You are playing a one-minute blitz chess game and it is your turn. " +
    "Choose the move you would actually play. Each option is a legal move that " +
    "has already been checked by the engine, described by what it does to the " +
    "position. Weigh material, king safety, threats and activity together.",
  reading_the_options: {
    opponent_can_win:
      "Pawns of material the opponent wins back immediately with their single " +
      "best reply. 0 means the move is safe against an immediate recapture. " +
      "A value of 3 or more usually means the move hangs a piece.",
    opponent_mates_in_one:
      "True means the opponent has checkmate on their very next move. Never " +
      "choose such a move unless every option is like that.",
    is_checkmate: "True means this move ends the game in your favour right now. Always choose it.",
    material_after_best_reply:
      "Your material balance in pawns once the opponent has replied. Positive " +
      "is good for you, negative means you are behind.",
    lands_on_attacked_square:
      "The square you move to is attacked by the opponent. Safe only if the " +
      "piece is also defended, or the trade wins material.",
  },
  priorities: [
    "Checkmate now if it is available.",
    "Do not allow checkmate next move.",
    "Do not give away material for nothing.",
    "Answer real threats before starting your own.",
    "Otherwise develop, take the centre, castle, and create threats.",
  ],
  clock:
    "This is blitz, so prefer a clear, solid move over a speculative one. " +
    "Repeating a position you have already reached wastes time.",
};

function describeMove(feature: MoveFeature): Record<string, JsonValue> {
  const description: Record<string, JsonValue> = {
    move: feature.san,
    moves: `${feature.piece} ${feature.from} to ${feature.to}`,
    material_after_best_reply: feature.materialAfterBestReply,
    opponent_can_win: feature.opponentCanWin,
  };

  if (feature.isCheckmate) description.is_checkmate = true;
  if (feature.opponentMatesInOne) description.opponent_mates_in_one = true;
  if (feature.givesCheck) description.gives_check = true;
  if (feature.captures) description.captures = feature.captures;
  if (feature.promotesTo) description.promotes_to = feature.promotesTo;
  if (feature.isCastle) description.castles = true;
  if (feature.isEnPassant) description.en_passant = true;
  if (feature.landsOnAttackedSquare) {
    description.lands_on_attacked_square = true;
    description.lands_on_defended_square = feature.landsOnDefendedSquare;
  }
  if (feature.rescuesHangingPiece) description.moves_an_attacked_piece_to_safety = true;
  if (feature.takesCentre) description.takes_a_central_square = true;
  if (feature.develops) description.develops_a_new_piece = true;
  if (feature.repeats) description.repeats_an_earlier_position = true;

  return description;
}

function buildQuestions(candidates: MoveFeature[]): Record<string, Question> {
  const criteria: Record<string, Description | null> = {};
  for (const candidate of candidates) criteria[candidate.id] = describeMove(candidate);

  const bestMove: ChoiceQuestion = {
    type: "choice",
    instructions: MOVE_INSTRUCTIONS,
    criteria,
  };

  const assessment: ScoreQuestion = {
    type: "score",
    instructions:
      "Ignoring which move you pick, how does the position in `position.fen` " +
      "stand for you right now, given the material balance and the recent moves?",
    criteria: [
      "Losing. Down significant material or facing an attack that cannot be held.",
      "Worse. Under pressure or down a pawn, but still playable.",
      "Balanced. Neither side has anything concrete.",
      "Better. An extra pawn, the safer king, or the more active pieces.",
      "Winning. Up a piece or more, or with a decisive attack.",
    ],
  };

  const threat: NoulQuestion = {
    type: "noul",
    instructions:
      "The opponent has a concrete threat on the board that must be answered " +
      "this move, such as a hanging piece of yours, a mate threat, or a fork.",
  };

  return { best_move: bestMove, assessment, threat };
}

function buildState(
  chess: Chess,
  colour: Color,
  candidates: MoveFeature[],
  clock: { jevMs: number; humanMs: number },
): JsonValue {
  const position = summarisePosition(chess, colour);
  return {
    game: {
      format: "one minute blitz, no increment",
      you_play: colour === "w" ? "white" : "black",
      opponent: "a human player",
    },
    position: {
      fen: position.fen,
      move_number: position.moveNumber,
      you_are_in_check: position.inCheck,
      your_material_balance_in_pawns: position.materialBalance,
      phase: position.phase,
      recent_moves: position.recentMoves,
    },
    clock: {
      your_seconds_left: Math.round(clock.jevMs / 1000),
      opponent_seconds_left: Math.round(clock.humanMs / 1000),
    },
    candidate_count: candidates.length,
  };
}

/** Jev's score answer is 0..4 over five levels; normalise to -1..+1. */
function normaliseAssessment(score: number): number {
  return Math.round(((score / 4) * 2 - 1) * 100) / 100;
}

/**
 * Guardrails.
 *
 * In `guarded` mode code takes two decisions away from Jev: it plays an
 * available mate in one, and it refuses to hand the human mate in one when a
 * safe alternative exists. Everything else is Jev's call. In `raw` mode Jev's
 * pick is played exactly as chosen.
 */
function applyGuardrails(
  candidates: MoveFeature[],
  difficulty: Difficulty,
): { candidates: MoveFeature[]; forced: MoveFeature | null } {
  const mate = candidates.find((c) => c.isCheckmate);
  if (mate) return { candidates, forced: mate };
  if (difficulty === "raw") return { candidates, forced: null };

  const safe = candidates.filter((c) => !c.opponentMatesInOne);
  return { candidates: safe.length > 0 ? safe : candidates, forced: null };
}

export interface ChooseMoveInput {
  fen: string;
  /** Full SAN history, so repetition and opening context are visible. */
  history?: string[];
  difficulty?: Difficulty;
  clock?: { jevMs: number; humanMs: number };
  /** Hard latency budget. Past it, the local engine plays instead. */
  timeoutMs?: number;
}

export async function chooseMove(input: ChooseMoveInput): Promise<JevMoveResult> {
  const started = Date.now();
  const chess = new Chess();

  // Replay the history so repetition detection and the PGN stay intact; fall
  // back to the FEN alone if the client sent a history we cannot replay.
  let replayed = false;
  if (input.history?.length) {
    try {
      for (const san of input.history) chess.move(san);
      replayed = chess.fen() === input.fen;
    } catch {
      replayed = false;
    }
  }
  if (!replayed) chess.load(input.fen);

  if (chess.isGameOver()) {
    throw new Error("The game is already over in this position.");
  }

  const colour = chess.turn();
  const difficulty = input.difficulty ?? "guarded";
  const clock = input.clock ?? { jevMs: 60_000, humanMs: 60_000 };
  const timeoutMs = input.timeoutMs ?? Number(process.env.JEV_MOVE_TIMEOUT_MS ?? 4500);

  const all = annotateMoves(chess);
  const { candidates: legalPool, forced } = applyGuardrails(all, difficulty);

  if (forced) {
    return {
      ...toResult(forced),
      source: "forced",
      confidence: 1,
      considered: [{ san: forced.san, probability: 1 }],
      assessment: 1,
      threatLevel: 0,
      note: "Checkmate was available, so code played it without asking.",
      model: null,
      latencyMs: Date.now() - started,
      inputTokens: null,
      costUsd: null,
    };
  }

  const candidates = shortlist(legalPool);

  if (candidates.length === 1) {
    return {
      ...toResult(candidates[0]),
      source: "forced",
      confidence: 1,
      considered: [{ san: candidates[0].san, probability: 1 }],
      assessment: null,
      threatLevel: null,
      note: "Only one legal move.",
      model: null,
      latencyMs: Date.now() - started,
      inputTokens: null,
      costUsd: null,
    };
  }

  const useFallback = (note: string): JevMoveResult => {
    const move = fallbackMove(chess, legalPool);
    return {
      ...toResult(move),
      source: "fallback",
      confidence: null,
      considered: [],
      assessment: null,
      threatLevel: null,
      note,
      model: null,
      latencyMs: Date.now() - started,
      inputTokens: null,
      costUsd: null,
    };
  };

  if (!isConfigured()) {
    return useFallback("No Jev API key is configured, so the local engine played.");
  }

  try {
    const response = await systemOne(
      buildState(chess, colour, candidates, clock),
      buildQuestions(candidates),
      { timeoutMs, attempts: 2 },
    );

    const choice = asChoice(response.answers.best_move);
    const picked = candidates.find((c) => c.id === choice?.choice);

    if (!choice || !picked) {
      return useFallback("Jev returned no usable choice, so the local engine played.");
    }

    const considered = Object.entries(choice.probabilities)
      .map(([id, probability]) => ({
        san: candidates.find((c) => c.id === id)?.san ?? id,
        probability: Math.round(probability * 1000) / 1000,
      }))
      .filter((entry) => entry.probability > 0.005)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);

    const score = asScore(response.answers.assessment);
    const threat = asNoul(response.answers.threat);

    return {
      ...toResult(picked),
      source: "jev",
      confidence: Math.round(choice.confidence * 100) / 100,
      considered,
      assessment: score ? normaliseAssessment(score.score) : null,
      threatLevel: threat ? Math.round(threat.noul * 100) / 100 : null,
      note: null,
      model: response.model,
      latencyMs: Date.now() - started,
      inputTokens: response.usage?.input_tokens ?? null,
      costUsd: response.usage?.cost ?? null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return useFallback(`Jev was unavailable (${reason.slice(0, 120)}), so the local engine played.`);
  }
}

function toResult(feature: MoveFeature) {
  return {
    san: feature.san,
    uci: feature.uci,
    from: feature.from as string,
    to: feature.to as string,
    promotion: feature.promotesTo ? feature.uci.slice(4) || null : null,
  };
}
