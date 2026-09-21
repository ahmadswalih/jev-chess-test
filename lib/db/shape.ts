/**
 * Turning raw rows into the leaderboard the pages render.
 *
 * Both storage backends return the same four row shapes; every percentage,
 * label and ranking is computed here so SQLite and Postgres can never drift
 * apart on the arithmetic.
 */

import {
  LOSS_REASONS,
  REASON_LABELS,
  type Leaderboard,
  type LossReason,
  type PlayerRow,
  type RecentRow,
} from "../types";

export interface TotalsRow {
  games: number;
  jevWins: number;
  humanWins: number;
  draws: number;
  players: number;
  avgMoves: number;
  avgDurationMs: number;
}

export interface ReasonCountRow {
  reason: LossReason;
  count: number;
}

export type PlayerCountRow = Omit<PlayerRow, "rank" | "winRate">;

export function buildLeaderboard(
  totals: TotalsRow,
  reasonRows: ReasonCountRow[],
  playerRows: PlayerCountRow[],
  recent: RecentRow[],
): Leaderboard {
  const games = Number(totals.games) || 0;
  const jevWins = Number(totals.jevWins) || 0;
  const humanWins = Number(totals.humanWins) || 0;
  const draws = Number(totals.draws) || 0;
  const reasonTotal = reasonRows.reduce((sum, row) => sum + Number(row.count), 0);

  return {
    totals: {
      games,
      jevWins,
      humanWins,
      draws,
      players: Number(totals.players) || 0,
      jevWinRate: games ? Math.round((jevWins / games) * 1000) / 10 : 0,
      humanWinRate: games ? Math.round((humanWins / games) * 1000) / 10 : 0,
      avgMoves: Math.round(Number(totals.avgMoves) || 0),
      avgDurationMs: Math.round(Number(totals.avgDurationMs) || 0),
    },
    reasons: reasonRows.map((row) => ({
      reason: row.reason,
      label: REASON_LABELS[row.reason] ?? row.reason,
      description: LOSS_REASONS[row.reason] ?? "",
      count: Number(row.count),
      share: reasonTotal ? Math.round((Number(row.count) / reasonTotal) * 1000) / 10 : 0,
    })),
    players: playerRows.map((row, index) => {
      const played = Number(row.games) || 0;
      const wins = Number(row.wins) || 0;
      return {
        playerName: row.playerName,
        games: played,
        wins,
        draws: Number(row.draws) || 0,
        losses: Number(row.losses) || 0,
        bestWinMoves: row.bestWinMoves === null ? null : Number(row.bestWinMoves),
        lastPlayed: row.lastPlayed,
        rank: index + 1,
        winRate: played ? Math.round((wins / played) * 1000) / 10 : 0,
      };
    }),
    recent: recent.map((row) => ({ ...row, moveCount: Number(row.moveCount) })),
  };
}
