"use client";

/**
 * A window into the decision itself.
 *
 * Jev returns a full probability distribution over the moves it was offered,
 * plus its own read of the position and of your threats. None of that is
 * needed to play the move -- it is shown because a calibrated decision model
 * is much more interesting when you can watch it decide.
 */

import type { JevMoveResult, JevHealth } from "@/lib/types";

interface Props {
  jev: JevMoveResult | null;
  thinking: boolean;
  health: JevHealth | null;
  error: string | null;
}

export default function JevPanel({ jev, thinking, health, error }: Props) {
  const assessment = jev?.assessment ?? null;
  const evalPercent = assessment === null ? 50 : ((assessment + 1) / 2) * 100;

  return (
    <section className="panel-section">
      <div className="panel-title">
        <span>Jev&apos;s decision</span>
        {thinking ? (
          <span className="pill" data-tone="accent">
            <span className="thinking" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            deciding
          </span>
        ) : (
          <span className="pill" data-tone={health?.jevEnabled ? "live" : "warn"}>
            <span className="dot" aria-hidden />
            {health?.jevEnabled ? (health.model ?? "jev") : "local engine"}
          </span>
        )}
      </div>

      {error && (
        <p className="empty" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}

      {!jev && !error && (
        <p className="empty">
          {thinking
            ? "Jev is weighing its legal moves."
            : "Jev's probabilities appear here after its first move."}
        </p>
      )}

      {jev && (
        <>
          <div className="jev-line">
            <span>Played</span>
            <strong style={{ fontFamily: "var(--mono)" }}>{jev.san}</strong>
          </div>

          {jev.confidence !== null && (
            <>
              <div className="jev-line">
                <span>Confidence</span>
                <strong>{Math.round(jev.confidence * 100)}%</strong>
              </div>
              <div className="bar" aria-hidden>
                <span style={{ width: `${jev.confidence * 100}%` }} />
              </div>
            </>
          )}

          {assessment !== null && (
            <div style={{ marginTop: 13 }}>
              <div className="jev-line">
                <span>How Jev rates its position</span>
                <strong>
                  {assessment > 0.15 ? "better" : assessment < -0.15 ? "worse" : "balanced"}
                </strong>
              </div>
              <div className="eval-track" aria-hidden>
                <i style={{ left: `${evalPercent}%` }} />
              </div>
            </div>
          )}

          {jev.threatLevel !== null && (
            <div style={{ marginTop: 13 }}>
              <div className="jev-line">
                <span>Reads a threat from you</span>
                <strong>{Math.round(jev.threatLevel * 100)}%</strong>
              </div>
              <div className="bar" data-tone="warn" aria-hidden>
                <span style={{ width: `${jev.threatLevel * 100}%` }} />
              </div>
            </div>
          )}

          {jev.considered.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <div className="panel-title" style={{ marginBottom: 4 }}>
                <span>Moves it weighed</span>
              </div>
              {jev.considered.map((candidate) => (
                <div
                  className="candidate"
                  key={candidate.san}
                  data-picked={candidate.san === jev.san}
                >
                  <span className="candidate-san">{candidate.san}</span>
                  <span className="bar" aria-hidden>
                    <span style={{ width: `${Math.max(candidate.probability * 100, 1.5)}%` }} />
                  </span>
                  <span className="candidate-pct">
                    {(candidate.probability * 100).toFixed(candidate.probability >= 0.1 ? 0 : 1)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="meta-row">
            <span>{jev.latencyMs} ms</span>
            {jev.inputTokens !== null && <span>{jev.inputTokens} tok</span>}
            {jev.costUsd !== null && <span>${jev.costUsd.toFixed(6)}</span>}
            {jev.source !== "jev" && <span style={{ color: "var(--amber)" }}>{jev.source}</span>}
          </div>

          {jev.note && (
            <p className="empty" style={{ marginTop: 8, color: "var(--amber)" }}>
              {jev.note}
            </p>
          )}
        </>
      )}
    </section>
  );
}
