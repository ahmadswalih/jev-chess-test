/**
 * Leaderboard storage.
 *
 * Two backends behind one interface, chosen by environment:
 *
 *   Postgres  when DATABASE_URL (or POSTGRES_URL) is set, or JEV_STORE=postgres
 *   SQLite    otherwise
 *
 * That means local development needs no setup at all, and a serverless deploy
 * needs one environment variable. Nothing else in the app knows which is in
 * use, and this is the only directory that touches storage.
 */

import type { GameRecord, Leaderboard } from "../types";
import { connectionString } from "./postgres";

export type Backend = "sqlite" | "postgres";

export function backend(): Backend {
  const forced = process.env.JEV_STORE?.trim().toLowerCase();
  if (forced === "postgres" || forced === "sqlite") return forced;
  return connectionString() ? "postgres" : "sqlite";
}

async function store() {
  return backend() === "postgres" ? import("./postgres") : import("./sqlite");
}

export async function saveGame(record: GameRecord): Promise<void> {
  return (await store()).saveGame(record);
}

export async function readLeaderboard(limit = 10): Promise<Leaderboard> {
  return (await store()).readLeaderboard(limit);
}
