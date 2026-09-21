/**
 * Postgres backend — for Vercel and any other serverless host.
 *
 * Works with Vercel Postgres, Neon, Supabase or plain Postgres: anything you
 * can reach with a connection string. Point `DATABASE_URL` at a *pooled*
 * endpoint (pgbouncer) — serverless functions open a connection per instance
 * and a direct endpoint will run out of slots under load.
 *
 * `prepare: false` is required for transaction-mode poolers, which do not keep
 * a session around for named prepared statements.
 */

import postgres from "postgres";
import type { GameRecord, Leaderboard, RecentRow } from "../types";
import {
  buildLeaderboard,
  type PlayerCountRow,
  type ReasonCountRow,
  type TotalsRow,
} from "./shape";

let sql: postgres.Sql | null = null;
let ready: Promise<void> | null = null;

/**
 * Where the connection string comes from, in order of preference.
 *
 * `POSTGRES_URL` is what Vercel's Neon integration injects, and it is already
 * the pooled endpoint, so a Neon-on-Vercel project needs no manual setup at
 * all. `POSTGRES_URL_NON_POOLING` is the direct endpoint and is only a last
 * resort -- it works, but every serverless instance holds a real connection
 * and the database will run out of slots under load.
 *
 * `POSTGRES_PRISMA_URL` is deliberately not used: it carries Prisma-specific
 * query parameters (`pgbouncer=true`) that this driver would forward to the
 * server as unknown connection options.
 */
export function connectionString(): string | null {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    null
  );
}

function client(): postgres.Sql {
  if (sql) return sql;

  const url = connectionString();
  if (!url) throw new Error("DATABASE_URL is not set.");

  sql = postgres(url, {
    prepare: false,
    // One connection per serverless instance; the pooler does the real work.
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: url.includes("sslmode=disable") ? false : "require",
  });

  return sql;
}

/** Created on first use, so a fresh database needs no migration step. */
function ensureSchema(): Promise<void> {
  if (ready) return ready;
  const db = client();

  ready = (async () => {
    await db`
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
        loss_reason_confidence DOUBLE PRECISION,
        loss_summary           TEXT,
        blunder_count          INTEGER NOT NULL DEFAULT 0,
        jev_move_count         INTEGER NOT NULL DEFAULT 0,
        jev_fallback_count     INTEGER NOT NULL DEFAULT 0,
        avg_jev_latency_ms     INTEGER
      )`;
    await db`CREATE INDEX IF NOT EXISTS idx_games_played_at ON games (played_at DESC)`;
    await db`CREATE INDEX IF NOT EXISTS idx_games_player    ON games (player_name)`;
    await db`CREATE INDEX IF NOT EXISTS idx_games_reason    ON games (loss_reason)`;
  })();

  return ready;
}

export async function saveGame(record: GameRecord): Promise<void> {
  await ensureSchema();
  const db = client();

  await db`
    INSERT INTO games (
      id, player_name, played_at, result, termination, human_colour,
      move_count, duration_ms, human_time_left_ms, jev_time_left_ms,
      pgn, final_fen, difficulty, jev_model,
      loss_reason, loss_reason_confidence, loss_summary,
      blunder_count, jev_move_count, jev_fallback_count, avg_jev_latency_ms
    ) VALUES (
      ${record.id}, ${record.playerName}, ${record.playedAt}, ${record.result},
      ${record.termination}, ${record.humanColour},
      ${record.moveCount}, ${record.durationMs}, ${record.humanTimeLeftMs},
      ${record.jevTimeLeftMs},
      ${record.pgn}, ${record.finalFen}, ${record.difficulty}, ${record.jevModel},
      ${record.lossReason}, ${record.lossReasonConfidence}, ${record.lossSummary},
      ${record.blunderCount}, ${record.jevMoveCount}, ${record.jevFallbackCount},
      ${record.avgJevLatencyMs}
    )
    ON CONFLICT (id) DO NOTHING`;
}

export async function readLeaderboard(limit: number): Promise<Leaderboard> {
  await ensureSchema();
  const db = client();

  const [totals, reasons, players, recent] = await Promise.all([
    db<TotalsRow[]>`
      SELECT
        COUNT(*)::int                                                 AS "games",
        COALESCE(SUM(CASE WHEN result = 'jev'   THEN 1 ELSE 0 END),0)::int AS "jevWins",
        COALESCE(SUM(CASE WHEN result = 'human' THEN 1 ELSE 0 END),0)::int AS "humanWins",
        COALESCE(SUM(CASE WHEN result = 'draw'  THEN 1 ELSE 0 END),0)::int AS "draws",
        COUNT(DISTINCT player_name)::int                              AS "players",
        COALESCE(AVG(move_count), 0)::float8                          AS "avgMoves",
        COALESCE(AVG(duration_ms), 0)::float8                         AS "avgDurationMs"
      FROM games`,
    db<ReasonCountRow[]>`
      SELECT loss_reason AS "reason", COUNT(*)::int AS "count"
      FROM games
      WHERE result = 'jev' AND loss_reason IS NOT NULL
      GROUP BY loss_reason
      ORDER BY "count" DESC`,
    db<PlayerCountRow[]>`
      SELECT
        player_name                                              AS "playerName",
        COUNT(*)::int                                            AS "games",
        COALESCE(SUM(CASE WHEN result = 'human' THEN 1 ELSE 0 END),0)::int AS "wins",
        COALESCE(SUM(CASE WHEN result = 'draw'  THEN 1 ELSE 0 END),0)::int AS "draws",
        COALESCE(SUM(CASE WHEN result = 'jev'   THEN 1 ELSE 0 END),0)::int AS "losses",
        MIN(CASE WHEN result = 'human' THEN move_count END)::int AS "bestWinMoves",
        MAX(played_at)                                           AS "lastPlayed"
      FROM games
      GROUP BY player_name
      ORDER BY "wins" DESC, "draws" DESC, "games" DESC, "lastPlayed" DESC
      LIMIT ${limit}`,
    db<RecentRow[]>`
      SELECT id, player_name AS "playerName", played_at AS "playedAt", result,
             termination, move_count AS "moveCount", loss_reason AS "lossReason",
             loss_summary AS "lossSummary", human_colour AS "humanColour"
      FROM games
      ORDER BY played_at DESC
      LIMIT ${limit}`,
  ]);

  return buildLeaderboard(
    totals[0] ?? {
      games: 0,
      jevWins: 0,
      humanWins: 0,
      draws: 0,
      players: 0,
      avgMoves: 0,
      avgDurationMs: 0,
    },
    [...reasons],
    [...players],
    [...recent],
  );
}
