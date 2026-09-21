/**
 * SQLite backend — the default for local development.
 *
 * One file, no setup, no network. It is not usable on a serverless host such
 * as Vercel, where the filesystem is read-only and every instance gets its own
 * ephemeral `/tmp`; see `postgres.ts` for that.
 */

import type BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { GameRecord, Leaderboard, RecentRow } from "../types";
import {
  buildLeaderboard,
  type PlayerCountRow,
  type ReasonCountRow,
  type TotalsRow,
} from "./shape";

let db: BetterSqlite3.Database | null = null;

function databasePath(): string {
  const configured = process.env.JEV_CHESS_DB?.trim() || "./data/jev-chess.db";
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

function getDb(): BetterSqlite3.Database {
  if (db) return db;

  // Required lazily so the native module is never loaded when Postgres is the
  // configured backend -- it does not need to exist in a serverless bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof BetterSqlite3;

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

export async function saveGame(record: GameRecord): Promise<void> {
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

export async function readLeaderboard(limit: number): Promise<Leaderboard> {
  const database = getDb();

  const totals = database
    .prepare(
      `SELECT
         COUNT(*)                          AS games,
         COALESCE(SUM(result = 'jev'), 0)   AS jevWins,
         COALESCE(SUM(result = 'human'), 0) AS humanWins,
         COALESCE(SUM(result = 'draw'), 0)  AS draws,
         COUNT(DISTINCT player_name)        AS players,
         COALESCE(AVG(move_count), 0)       AS avgMoves,
         COALESCE(AVG(duration_ms), 0)      AS avgDurationMs
       FROM games`,
    )
    .get() as TotalsRow;

  const reasons = database
    .prepare(
      `SELECT loss_reason AS reason, COUNT(*) AS count
       FROM games
       WHERE result = 'jev' AND loss_reason IS NOT NULL
       GROUP BY loss_reason
       ORDER BY count DESC`,
    )
    .all() as ReasonCountRow[];

  const players = database
    .prepare(
      `SELECT
         player_name                                         AS playerName,
         COUNT(*)                                            AS games,
         COALESCE(SUM(result = 'human'), 0)                  AS wins,
         COALESCE(SUM(result = 'draw'), 0)                   AS draws,
         COALESCE(SUM(result = 'jev'), 0)                    AS losses,
         MIN(CASE WHEN result = 'human' THEN move_count END) AS bestWinMoves,
         MAX(played_at)                                      AS lastPlayed
       FROM games
       GROUP BY player_name
       ORDER BY wins DESC, draws DESC, games DESC, lastPlayed DESC
       LIMIT ?`,
    )
    .all(limit) as PlayerCountRow[];

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

  return buildLeaderboard(totals, reasons, players, recent);
}
