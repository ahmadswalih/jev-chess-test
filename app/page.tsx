"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Color } from "chess.js";
import ChessBoard from "@/components/ChessBoard";
import ClockRow from "@/components/ClockRow";
import GameOverCard from "@/components/GameOverCard";
import JevPanel from "@/components/JevPanel";
import Modal from "@/components/Modal";
import MoveList from "@/components/MoveList";
import { useChessGame } from "@/hooks/useChessGame";
import type { JevHealth } from "@/lib/types";

const NAME_KEY = "jev-chess:name";

export default function PlayPage() {
  const [playerName, setPlayerName] = useState("");
  const [colourChoice, setColourChoice] = useState<"w" | "b" | "random">("w");
  const [humanColour, setHumanColour] = useState<Color>("w");
  const [health, setHealth] = useState<JevHealth | null>(null);
  const [showResult, setShowResult] = useState(true);
  const [showSetup, setShowSetup] = useState(true);

  const game = useChessGame({
    playerName: playerName.trim() || "Anonymous",
    humanColour,
    // Jev's own pick is always what gets played. The guardrail mode still
    // exists in lib/jev.ts and is reachable through the API's `difficulty`
    // field, it is just not a choice the player is asked to make.
    difficulty: "raw",
  });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NAME_KEY);
      if (saved) setPlayerName(saved);
    } catch {
      // Private browsing or storage disabled: the name just is not remembered.
    }
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : null))
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  /** Reopen the pre-game dialog, resetting a finished game back to the board. */
  const openSetup = () => {
    if (game.phase === "over") game.reset();
    setShowSetup(true);
  };

  const startGame = () => {
    const colour: Color =
      colourChoice === "random" ? (Math.random() < 0.5 ? "w" : "b") : colourChoice;
    setHumanColour(colour);
    setShowResult(true);
    setShowSetup(false);
    try {
      window.localStorage.setItem(NAME_KEY, playerName.trim());
    } catch {
      // Ignore: storing the name is a convenience, not a requirement.
    }
    game.start(colour);
  };

  const jevColour: Color = humanColour === "w" ? "b" : "w";
  const captured = game.captured;

  const topCaptured = humanColour === "w" ? captured.black : captured.white;
  const bottomCaptured = humanColour === "w" ? captured.white : captured.black;
  const humanEdge = humanColour === "w" ? captured.balance : -captured.balance;

  const jevSubtitle = useMemo(() => {
    if (!health) return "TypeSafe System One";
    if (!health.jevEnabled) return "local fallback engine";
    return health.model;
  }, [health]);

  return (
    <main>
      {health && !health.jevEnabled && (
        <div className="notice" role="status">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            No Jev API key found, so a small local engine is playing instead. Add{" "}
            <code>OPENROUTER_API_KEY</code> to <code>.env.local</code> and restart to face the real
            model.
          </span>
        </div>
      )}

      <div className="game">
        <div className="board-column">
          <ClockRow
            name="Jev"
            subtitle={jevSubtitle}
            avatar="◆"
            ms={game.clock.jev}
            active={game.phase === "playing" && game.view.turn === jevColour}
            captured={topCaptured}
            edge={-humanEdge}
            colour={humanColour}
          />

          <ChessBoard
            board={game.view.board}
            orientation={humanColour}
            moves={game.view.moves}
            lastMove={game.lastMove}
            checkSquare={game.view.checkSquare}
            onMove={game.playMove}
            disabled={game.phase !== "playing" || !game.isHumanTurn}
          />
          <ClockRow
            name={playerName.trim() || "You"}
            subtitle="human"
            avatar="☗"
            ms={game.clock.human}
            active={game.isHumanTurn}
            captured={bottomCaptured}
            edge={humanEdge}
            colour={jevColour}
          />
        </div>

        <div className="side-column">
          <div className="panel">
            <JevPanel jev={game.jev} thinking={game.thinking} health={health} error={game.error} />

            <MoveList history={game.view.history} />

            <section className="panel-section">
              <div className="panel-title">
                <span>Game</span>
                <span className="pill">1 + 0</span>
              </div>
              {game.phase !== "playing" && (
                <button
                  type="button"
                  className="btn"
                  data-variant="play"
                  onClick={openSetup}
                  style={{ marginBottom: 8 }}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M6.3 3.4A1 1 0 0 0 4.8 4.3v11.4a1 1 0 0 0 1.5.9l9.2-5.7a1 1 0 0 0 0-1.8L6.3 3.4Z" />
                  </svg>
                  {game.phase === "idle" ? "Play Jev" : "New game"}
                </button>
              )}

              <div className="btn-row">
                {game.phase === "playing" && (
                  <button type="button" className="btn" data-variant="danger" onClick={game.resign}>
                    Resign
                  </button>
                )}
                {game.phase === "over" && !showResult && (
                  <button type="button" className="btn" onClick={() => setShowResult(true)}>
                    Show result
                  </button>
                )}
                <Link className="btn" data-variant="ghost" href="/leaderboard">
                  Leaderboard
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>

      {game.phase === "idle" && showSetup && (
        <Modal label="Start a game" onClose={() => setShowSetup(false)}>
          <div className="result-card">
            <div className="result-headline">One minute each.</div>
            <p className="result-sub">
              You versus Jev, a model that does not generate moves — it judges between
              them. Every legal move is generated in code, annotated, and handed to Jev as a
              typed decision.
            </p>

            <div style={{ display: "grid", gap: 13, marginBottom: 16 }}>
              <div className="field">
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  className="input"
                  value={playerName}
                  maxLength={24}
                  placeholder="Anonymous"
                  onChange={(event) => setPlayerName(event.target.value)}
                />
              </div>

              <div className="field">
                <label>Play as</label>
                <div className="segmented">
                  {(
                    [
                      ["w", "White"],
                      ["b", "Black"],
                      ["random", "Random"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      data-selected={colourChoice === value}
                      onClick={() => setColourChoice(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button type="button" className="btn" data-variant="primary" onClick={startGame}>
              Start the clock
            </button>
          </div>
        </Modal>
      )}

      {game.phase === "over" && game.outcome && showResult && (
        <Modal label="Game over" onClose={() => setShowResult(false)}>
          <GameOverCard
            outcome={game.outcome}
            review={game.review}
            reviewing={game.reviewing}
            onRematch={() => {
              setShowResult(true);
              game.start(humanColour);
            }}
            onNewSetup={openSetup}
          />
        </Modal>
      )}
    </main>
  );
}
