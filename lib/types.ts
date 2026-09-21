/**
 * Types shared by the server modules and the browser.
 *
 * Nothing here imports node built-ins or the database, so client components can
 * pull from this file freely.
 */

export type Difficulty = "raw" | "guarded";
export type GameResult = "jev" | "human" | "draw";
export type Termination =
  | "checkmate"
  | "timeout"
  | "resignation"
  | "stalemate"
  | "draw"
  | "abandoned";

export interface JevMoveResult {
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion: string | null;
  /** Where the move came from. */
  source: "jev" | "fallback" | "forced";
  /** Jev's confidence in the pick, 0-1. Null when Jev did not decide. */
  confidence: number | null;
  /** Jev's top candidates with their probabilities, for the UI. */
  considered: { san: string; probability: number }[];
  /** Jev's read of its own position, -1 (lost) to +1 (winning). */
  assessment: number | null;
  /** Probability that the human has a real threat on the board right now. */
  threatLevel: number | null;
  /** Set when code overrode or filled in for Jev. */
  note: string | null;
  model: string | null;
  latencyMs: number;
  inputTokens: number | null;
  /** USD charged for the call, when the provider reports it. */
  costUsd: number | null;
}

export interface Blunder {
  moveNumber: number;
  san: string;
  /** Pawns of material the opponent could win right after this move. */
  lost: number;
  punishedBy: string;
  piece: string | null;
}

/**
 * The reasons a human loses a one-minute game, as Jev is asked to choose
 * between them. The descriptions are the rubric the model reads, so they are
 * written to be mutually distinguishable rather than merely readable.
 */
export const LOSS_REASONS = {
  flagged_on_time:
    "Ran out of clock. The position itself was still playable, or even better for them, but the flag fell first.",
  hung_a_piece:
    "Left a piece or a rook undefended and it was simply taken, with no compensation.",
  queen_blunder: "Lost the queen outright, to a capture, a fork, a pin or a skewer.",
  missed_a_tactic:
    "Missed a concrete tactical shot: a fork, pin, skewer, discovered attack or back rank trick.",
  walked_into_mate:
    "Got checkmated with material still roughly level, by leaving the king exposed or ignoring a mating threat.",
  opening_disaster:
    "Fell apart in the first ten moves, from a trap, a scholar's mate pattern or an early piece loss.",
  overextended_attack:
    "Attacked too early with too few pieces, and the attack collapsed leaving weaknesses behind.",
  slow_squeeze:
    "Played passively and got gradually outplayed. No single blunder, just worse pieces move after move.",
  endgame_technique:
    "Reached an endgame in a fine position and then misplayed it: pawn races, king activity or promotion.",
  resigned_early: "Gave up in a position that was still defensible.",
} as const;

export type LossReason = keyof typeof LOSS_REASONS;

export const REASON_LABELS: Record<LossReason, string> = {
  flagged_on_time: "Ran out of time",
  hung_a_piece: "Hung a piece",
  queen_blunder: "Lost the queen",
  missed_a_tactic: "Missed a tactic",
  walked_into_mate: "Walked into mate",
  opening_disaster: "Opening disaster",
  overextended_attack: "Overextended attack",
  slow_squeeze: "Slowly outplayed",
  endgame_technique: "Endgame technique",
  resigned_early: "Resigned early",
};

export interface ReviewResult {
  reason: LossReason | null;
  confidence: number | null;
  /** Probability the clock, not the position, was the real cause. */
  timePressure: number | null;
  blunders: Blunder[];
  summary: string;
  source: "jev" | "heuristic";
}

export interface GameRecord {
  id: string;
  playerName: string;
  playedAt: string;
  result: GameResult;
  termination: Termination;
  humanColour: "w" | "b";
  moveCount: number;
  durationMs: number;
  humanTimeLeftMs: number;
  jevTimeLeftMs: number;
  pgn: string;
  finalFen: string;
  difficulty: string;
  jevModel: string | null;
  lossReason: LossReason | null;
  lossReasonConfidence: number | null;
  lossSummary: string | null;
  blunderCount: number;
  jevMoveCount: number;
  jevFallbackCount: number;
  avgJevLatencyMs: number | null;
}

export interface LeaderboardTotals {
  games: number;
  jevWins: number;
  humanWins: number;
  draws: number;
  players: number;
  jevWinRate: number;
  humanWinRate: number;
  avgMoves: number;
  avgDurationMs: number;
}

export interface ReasonRow {
  reason: LossReason;
  label: string;
  description: string;
  count: number;
  share: number;
}

export interface PlayerRow {
  rank: number;
  playerName: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  bestWinMoves: number | null;
  lastPlayed: string;
}

export interface RecentRow {
  id: string;
  playerName: string;
  playedAt: string;
  result: GameResult;
  termination: Termination;
  moveCount: number;
  lossReason: LossReason | null;
  lossSummary: string | null;
  humanColour: "w" | "b";
}

export interface Leaderboard {
  totals: LeaderboardTotals;
  reasons: ReasonRow[];
  players: PlayerRow[];
  recent: RecentRow[];
}

export interface JevHealth {
  jevEnabled: boolean;
  provider: "openrouter" | "typesafe";
  model: string;
  moveTimeoutMs: number;
}
