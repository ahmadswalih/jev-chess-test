import type { Metadata } from "next";
import Link from "next/link";
import { readLeaderboard } from "@/lib/db";
import { REASON_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DESCRIPTION =
  "Who beats Jev, how often, and the reasons humans lose at one-minute chess — " +
  "each loss classified by Jev itself.";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: DESCRIPTION,
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "Jev Chess leaderboard",
    description: DESCRIPTION,
    url: "/leaderboard",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jev Chess leaderboard",
    description: DESCRIPTION,
  },
};

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const RESULT_LABEL = {
  human: "Human win",
  jev: "Jev win",
  draw: "Draw",
} as const;

export default async function LeaderboardPage() {
  const { totals, reasons, players, recent } = await readLeaderboard(20);

  return (
    <main>
      <div className="page-head">
        <h2>Leaderboard</h2>
        <p>
          Every finished game, and Jev&apos;s own read on why each human lost.
          {totals.games > 0 && (
            <>
              {" "}
              {totals.players} player{totals.players === 1 ? "" : "s"} so far, averaging{" "}
              {formatDuration(totals.avgDurationMs)} a game.
            </>
          )}
        </p>
      </div>

      {totals.games === 0 ? (
        <div className="empty-state">
          <p>No games recorded yet. Be the first to take a minute off Jev.</p>
          <Link className="btn" data-variant="primary" href="/">
            Play a game
          </Link>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-value">{totals.games}</div>
              <p className="stat-label">games</p>
            </div>
            <div className="stat">
              <div className="stat-value" data-tone="jev">
                {totals.jevWins}
                <span className="stat-pct">{totals.jevWinRate}%</span>
              </div>
              <p className="stat-label">Jev wins</p>
            </div>
            <div className="stat">
              <div className="stat-value" data-tone="human">
                {totals.humanWins}
                <span className="stat-pct">{totals.humanWinRate}%</span>
              </div>
              <p className="stat-label">human wins</p>
            </div>
            <div className="stat">
              <div className="stat-value" data-tone="draw">
                {totals.draws}
              </div>
              <p className="stat-label">draws</p>
            </div>
            <div className="stat">
              <div className="stat-value">{totals.avgMoves}</div>
              <p className="stat-label">avg moves</p>
            </div>
          </div>

          <div className="columns">
            <section>
              <div className="section-head">
                <h3>How humans lose</h3>
                <span>
                  {totals.jevWins} loss{totals.jevWins === 1 ? "" : "es"}
                </span>
              </div>

              {reasons.length === 0 ? (
                <p className="empty">Jev has not won a game yet.</p>
              ) : (
                reasons.map((row) => (
                  <div className="reason" key={row.reason}>
                    <div className="reason-head">
                      <span className="reason-label">
                        {REASON_LABELS[row.reason] ?? row.label}
                      </span>
                      <span className="reason-count">
                        {row.count} · {row.share}%
                      </span>
                    </div>
                    <div className="bar" aria-hidden>
                      <span style={{ width: `${Math.max(row.share, 2)}%` }} />
                    </div>
                    <p className="reason-desc">{row.description}</p>
                  </div>
                ))
              )}

              <p className="note">
                Each loss is classified by Jev itself, from the move list, the clock and an engine
                scan of the material mistakes.
              </p>
            </section>

            <section>
              <div className="section-head">
                <h3>Standings</h3>
                <span>By wins</span>
              </div>

              <div className="table-scroll">
                <div>
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th className="num">Won</th>
                        <th className="num">Drawn</th>
                        <th className="num">Lost</th>
                        <th className="num">Win rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((player) => (
                        <tr key={player.playerName}>
                          <td>
                            <span className="rank" data-top={player.rank}>
                              {player.rank}
                            </span>
                          </td>
                          <td className="name">{player.playerName}</td>
                          <td className="num">{player.wins}</td>
                          <td className="num">{player.draws}</td>
                          <td className="num">{player.losses}</td>
                          <td className="num">{player.winRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="section-head" style={{ marginTop: 28 }}>
                <h3>Recent games</h3>
                <span>Latest {recent.length}</span>
              </div>

              <div className="table-scroll">
                <div>
                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Result</th>
                        <th>Reason</th>
                        <th className="num">Moves</th>
                        <th className="num">Played</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((game) => (
                        <tr key={game.id}>
                          <td className="name">{game.playerName}</td>
                          <td>
                            <span className="tag" data-result={game.result}>
                              {RESULT_LABEL[game.result]}
                            </span>
                          </td>
                          <td style={{ color: "var(--text-dim)" }}>
                            {game.lossReason ? REASON_LABELS[game.lossReason] : "—"}
                          </td>
                          <td className="num">{game.moveCount}</td>
                          <td className="num">{formatDate(game.playedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
