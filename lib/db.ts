/**
 * Leaderboard storage: one SQLite file, opened once per server process.
 *
 * Every finished game is one row. The leaderboard views are plain aggregate
 * queries over that table, so nothing needs to be kept in sync by hand.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  LOSS_REASONS,
  REASON_LABELS,
  type GameRecord,
  type GameResult,
  type Leaderboard,
  type LossReason,
  type PlayerRow,
  type ReasonRow,
  type RecentRow,
} from "./types";

let db: Database.Database | null = null;

function databasePath(): string {
  const configured = process.env.JEV_CHESS_DB?.trim() || "./data/jev-chess.db";
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

export function getDb(): Database.Database {
  if (db) return db;

  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });

  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id                     TEXT PRIMARY KEY,
      player_name            TEXT NOT NULL,
      played_at              TEXT NOT NULL,
      result                 TEXT NOT NULL CHECK (result IN ('jev','human','draw')),
      termination            TEXT NOT NULL,
      human_colour           TEXT NOT NULL CHECK (human_colour IN ('w','b')),
      move_count             INTEGER NOT NULL DEFAULT 0,
      duration_ms            INTEGER NOT NULL DEFAULT 0,
      human_time_left_ms     INTEGER NOT NULL DEFAULT 0,
      jev_time_left_ms       INTEGER NOT NULL DEFAULT 0,
      pgn                    TEXT NOT NULL DEFAULT '',
      final_fen              TEXT NOT NULL DEFAULT '',
      difficulty             TEXT NOT NULL DEFAULT 'guarded',
      jev_model              TEXT,
      loss_reason            TEXT,
      loss_reason_confidence REAL,
      loss_summary           TEXT,
      blunder_count          INTEGER NOT NULL DEFAULT 0,
      jev_move_count         INTEGER NOT NULL DEFAULT 0,
      jev_fallback_count     INTEGER NOT NULL DEFAULT 0,
      avg_jev_latency_ms     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_games_played_at ON games (played_at DESC);
    CREATE INDEX IF NOT EXISTS idx_games_player    ON games (player_name);
    CREATE INDEX IF NOT EXISTS idx_games_reason    ON games (loss_reason);
  `);

  return db;
}

export function saveGame(record: GameRecord): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO games (
        id, player_name, played_at, result, termination, human_colour,
        move_count, duration_ms, human_time_left_ms, jev_time_left_ms,
        pgn, final_fen, difficulty, jev_model,
        loss_reason, loss_reason_confidence, loss_summary,
        blunder_count, jev_move_count, jev_fallback_count, avg_jev_latency_ms
      ) VALUES (
        @id, @playerName, @playedAt, @result, @termination, @humanColour,
        @moveCount, @durationMs, @humanTimeLeftMs, @jevTimeLeftMs,
        @pgn, @finalFen, @difficulty, @jevModel,
        @lossReason, @lossReasonConfidence, @lossSummary,
        @blunderCount, @jevMoveCount, @jevFallbackCount, @avgJevLatencyMs
      )`,
    )
    .run(record);
}

export function readLeaderboard(limit = 10): Leaderboard {
  const database = getDb();

  const totals = database
    .prepare(
      `SELECT
         COUNT(*)                                          AS games,
         SUM(result = 'jev')                               AS jevWins,
         SUM(result = 'human')                             AS humanWins,
         SUM(result = 'draw')                              AS draws,
         COUNT(DISTINCT player_name)                       AS players,
         COALESCE(AVG(move_count), 0)                      AS avgMoves,
         COALESCE(AVG(duration_ms), 0)                     AS avgDurationMs
       FROM games`,
    )
    .get() as {
    games: number;
    jevWins: number | null;
    humanWins: number | null;
    draws: number | null;
    players: number;
    avgMoves: number;
    avgDurationMs: number;
  };

  const games = totals.games ?? 0;
  const jevWins = totals.jevWins ?? 0;
  const humanWins = totals.humanWins ?? 0;
  const draws = totals.draws ?? 0;

  const reasonRows = database
    .prepare(
      `SELECT loss_reason AS reason, COUNT(*) AS count
       FROM games
       WHERE result = 'jev' AND loss_reason IS NOT NULL
       GROUP BY loss_reason
       ORDER BY count DESC`,
    )
    .all() as { reason: LossReason; count: number }[];

  const reasonTotal = reasonRows.reduce((sum, row) => sum + row.count, 0);

  const players = database
    .prepare(
      `SELECT
         player_name                                    AS playerName,
         COUNT(*)                                       AS games,
         SUM(result = 'human')                          AS wins,
         SUM(result = 'draw')                           AS draws,
         SUM(result = 'jev')                            AS losses,
         MIN(CASE WHEN result = 'human' THEN move_count END) AS bestWinMoves,
         MAX(played_at)                                 AS lastPlayed
       FROM games
       GROUP BY player_name
       ORDER BY wins DESC, draws DESC, games DESC, lastPlayed DESC
       LIMIT ?`,
    )
    .all(limit) as Omit<PlayerRow, "rank" | "winRate">[];

  const recent = database
    .prepare(
      `SELECT id, player_name AS playerName, played_at AS playedAt, result,
              termination, move_count AS moveCount, loss_reason AS lossReason,
              loss_summary AS lossSummary, human_colour AS humanColour
       FROM games
       ORDER BY played_at DESC
       LIMIT ?`,
    )
    .all(limit) as RecentRow[];

  return {
    totals: {
      games,
      jevWins,
      humanWins,
      draws,
      players: totals.players ?? 0,
      jevWinRate: games ? Math.round((jevWins / games) * 1000) / 10 : 0,
      humanWinRate: games ? Math.round((humanWins / games) * 1000) / 10 : 0,
      avgMoves: Math.round(totals.avgMoves ?? 0),
      avgDurationMs: Math.round(totals.avgDurationMs ?? 0),
    },
    reasons: reasonRows.map((row) => ({
      reason: row.reason,
      label: REASON_LABELS[row.reason] ?? row.reason,
      description: LOSS_REASONS[row.reason] ?? "",
      count: row.count,
      share: reasonTotal ? Math.round((row.count / reasonTotal) * 1000) / 10 : 0,
    })),
    players: players.map((row, index) => ({
      ...row,
      rank: index + 1,
      winRate: row.games ? Math.round((row.wins / row.games) * 1000) / 10 : 0,
    })),
    recent,
  };
}

