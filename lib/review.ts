/**
 * Post-game review.
 *
 * Code finds the evidence -- which human moves dropped material, how the game
 * ended, how much clock was left -- and Jev makes the one judgment code cannot:
 * *why* the human lost, in terms a person would recognise.
 *
 * The result feeds the leaderboard's "how humans lose" breakdown.
 */

import { Chess, material, PIECE_NAME, type Color, type Move } from "./chess-core";
import { asChoice, asNoul, isConfigured, systemOne, type Question } from "./decisions";
import {
  LOSS_REASONS,
  type Blunder,
  type LossReason,
  type ReviewResult,
  type Termination,
} from "./types";

/**
 * One-ply scan of the human's moves: after each, what does the opponent's best
 * single reply win? Cheap, deterministic, and it catches the mistakes that
 * actually decide blitz games.
 */
export function findBlunders(history: string[], humanColour: Color, threshold = 1.5): Blunder[] {
  const chess = new Chess();
  const blunders: Blunder[] = [];

  for (const san of history) {
    const mover = chess.turn();
    let played: Move | null = null;
    try {
      played = chess.move(san);
    } catch {
      break; // Malformed history: report what we found up to here.
    }
    if (!played || mover !== humanColour) continue;

    const before = material(chess, humanColour);
    let worst = before;
    let punishedBy = "";
    let piece: string | null = null;

    for (const reply of chess.moves({ verbose: true }) as Move[]) {
      chess.move(reply);
      const after = chess.isCheckmate() ? -1000 : material(chess, humanColour);
      if (after < worst) {
        worst = after;
        punishedBy = reply.san;
        piece = reply.captured ? PIECE_NAME[reply.captured] : null;
      }
      chess.undo();
    }

    const lost = before - worst;
    if (lost >= threshold) {
      blunders.push({
        moveNumber: chess.moveNumber(),
        san: played.san,
        lost: lost >= 900 ? 999 : Math.round(lost * 10) / 10,
        punishedBy,
        piece,
      });
    }
  }

  return blunders;
}


export interface ReviewInput {
  pgn: string;
  history: string[];
  humanColour: Color;
  termination: Termination;
  humanTimeLeftMs: number;
  jevTimeLeftMs: number;
  finalFen: string;
}

/** Deterministic fallback so the leaderboard still works without a Jev key. */
function heuristicReason(input: ReviewInput, blunders: Blunder[]): LossReason {
  if (input.termination === "timeout") return "flagged_on_time";
  if (input.termination === "resignation") return "resigned_early";

  const worst = blunders.reduce<Blunder | null>(
    (acc, b) => (!acc || b.lost > acc.lost ? b : acc),
    null,
  );

  if (worst && worst.moveNumber <= 10) return "opening_disaster";
  if (worst?.piece === "queen") return "queen_blunder";
  if (worst && worst.lost >= 3) return "hung_a_piece";
  if (worst && worst.lost >= 1.5) return "missed_a_tactic";
  if (input.termination === "checkmate") return "walked_into_mate";
  return "slow_squeeze";
}

function buildSummary(input: ReviewInput, blunders: Blunder[]): string {
  if (input.termination === "timeout") {
    return `The flag fell with ${blunders.length} material mistake${
      blunders.length === 1 ? "" : "s"
    } on the board.`;
  }
  const worst = blunders.reduce<Blunder | null>(
    (acc, b) => (!acc || b.lost > acc.lost ? b : acc),
    null,
  );
  if (!worst) return "No single material mistake stood out; the position drifted.";
  if (worst.lost >= 900) return `${worst.san} allowed ${worst.punishedBy}, and it was mate.`;
  return `${worst.san} on move ${worst.moveNumber} allowed ${worst.punishedBy}, costing ${worst.lost} pawn${
    worst.lost === 1 ? "" : "s"
  }.`;
}

export async function reviewLoss(input: ReviewInput): Promise<ReviewResult> {
  const blunders = findBlunders(input.history, input.humanColour);
  const summary = buildSummary(input, blunders);

  if (!isConfigured()) {
    return {
      reason: heuristicReason(input, blunders),
      confidence: null,
      timePressure: null,
      blunders,
      summary,
      source: "heuristic",
    };
  }

  const state = {
    game: {
      format: "one minute blitz, no increment",
      human_played: input.humanColour === "w" ? "white" : "black",
      opponent: "Jev, an AI decision model",
      how_it_ended: input.termination,
      total_moves: input.history.length,
    },
    clock_at_the_end: {
      human_seconds_left: Math.round(input.humanTimeLeftMs / 1000),
      jev_seconds_left: Math.round(input.jevTimeLeftMs / 1000),
    },
    moves: input.history,
    final_position_fen: input.finalFen,
    human_material_mistakes: blunders.length
      ? blunders.map((b) => ({
          move_number: b.moveNumber,
          human_move: b.san,
          punished_by: b.punishedBy,
          pawns_lost: b.lost >= 900 ? "checkmate" : b.lost,
          piece_lost: b.piece,
        }))
      : "none found by the engine scan",
  };

  const questions: Record<string, Question> = {
    reason: {
      type: "choice",
      instructions: {
        task:
          "The human player lost this one-minute blitz game against Jev. Pick " +
          "the single reason that best explains the loss, the way a coach " +
          "reviewing the game would describe it to them.",
        guidance:
          "Weigh `human_material_mistakes` and `how_it_ended` most heavily. " +
          "If `how_it_ended` is timeout, the reason is the clock unless the " +
          "position was already lost. Choose the decisive cause, not every " +
          "small thing that went wrong.",
      },
      criteria: LOSS_REASONS as unknown as Record<string, string>,
    },
    time_pressure: {
      type: "noul",
      instructions:
        "The clock, rather than the position on the board, is what really " +
        "decided this game for the human.",
    },
  };

  try {
    const response = await systemOne(state, questions, { timeoutMs: 9_000, attempts: 2 });
    const choice = asChoice(response.answers.reason);
    const noul = asNoul(response.answers.time_pressure);

    if (!choice || !(choice.choice in LOSS_REASONS)) {
      return {
        reason: heuristicReason(input, blunders),
        confidence: null,
        timePressure: null,
        blunders,
        summary,
        source: "heuristic",
      };
    }

    return {
      reason: choice.choice as LossReason,
      confidence: Math.round(choice.confidence * 100) / 100,
      timePressure: noul ? Math.round(noul.noul * 100) / 100 : null,
      blunders,
      summary,
      source: "jev",
    };
  } catch {
    return {
      reason: heuristicReason(input, blunders),
      confidence: null,
      timePressure: null,
      blunders,
      summary,
      source: "heuristic",
    };
  }
}
