"use client";

import Link from "next/link";
import { REASON_LABELS, type ReviewResult } from "@/lib/types";
import type { Outcome } from "@/hooks/useChessGame";

interface Props {
  outcome: Outcome;
  review: ReviewResult | null;
  reviewing: boolean;
  onRematch: () => void;
  onNewSetup: () => void;
}

export default function GameOverCard({
  outcome,
  review,
  reviewing,
  onRematch,
  onNewSetup,
}: Props) {
  return (
    <div className="result-card">
      <div className="result-headline" data-result={outcome.result}>
        {outcome.headline}
      </div>
      <p className="result-sub">{outcome.detail}</p>

      {outcome.result === "jev" && (
        <div className="verdict">
          <div className="verdict-label">
            {reviewing ? "Jev is reviewing the game" : "Why you lost"}
          </div>
          {reviewing && (
            <span className="thinking" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          )}
          {!reviewing && review?.reason && (
            <>
              <div className="verdict-reason">{REASON_LABELS[review.reason]}</div>
              <p className="verdict-detail">{review.summary}</p>
              <div
                style={{
                  marginTop: 9,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {review.confidence !== null && (
                  <span className="pill">{Math.round(review.confidence * 100)}% confident</span>
                )}
                {review.blunders.length > 0 && (
                  <span className="pill">
                    {review.blunders.length} material mistake
                    {review.blunders.length === 1 ? "" : "s"}
                  </span>
                )}
                {review.timePressure !== null && review.timePressure > 0.6 && (
                  <span className="pill" data-tone="warn">
                    clock decided it
                  </span>
                )}
              </div>
            </>
          )}
          {!reviewing && !review?.reason && (
            <p className="verdict-detail">The review could not be completed for this game.</p>
          )}
        </div>
      )}

      <div className="btn-row">
        <button type="button" className="btn" data-variant="primary" onClick={onRematch}>
          Rematch
        </button>
        <button type="button" className="btn" onClick={onNewSetup}>
          Change sides
        </button>
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <Link className="btn" data-variant="ghost" href="/leaderboard">
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
