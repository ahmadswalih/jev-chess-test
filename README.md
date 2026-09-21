# Jev Chess

One-minute blitz against **Jev**, TypeSafe's System One decision model.
Powered by [loopengine.tech](https://loopengine.tech).

Both sides get exactly 60 seconds and no increment. Jev's thinking time comes
out of Jev's own clock, so a slow decision costs it real time.

---

## How Jev plays chess

Jev does not generate text and it does not generate moves. It answers **typed
questions** about a **state** and returns calibrated probabilities. So the game
loop splits the work:

| Step | Who | Where |
| --- | --- | --- |
| 1. Generate every legal move | code | `lib/chess-core.ts` |
| 2. Annotate each move with what it does (captures, checks, what the opponent wins back, mate in one either way) | code | `lib/chess-core.ts` |
| 3. Shortlist the ~14 moves worth deciding between | code | `lib/chess-core.ts` |
| 4. Pick one, rate the position, read the threat | **Jev** | `lib/jev.ts` |
| 5. Play the pick, keep the distribution | code | `lib/jev.ts` |

All three questions go in **one request**. Jev ingests the state once and
evaluates the questions in parallel, which is both cheaper and faster than
separate calls — and on a 1+0 clock, latency is the game.

```jsonc
// One move, one request
{
  "model": "typesafe/jev-1.13",
  "state": {
    "game":     { "format": "one minute blitz, no increment", "you_play": "black" },
    "position": { "fen": "...", "your_material_balance_in_pawns": -1, "recent_moves": ["e4", "e5"] },
    "clock":    { "your_seconds_left": 41, "opponent_seconds_left": 37 }
  },
  "questions": {
    "best_move":  { "type": "choice", "instructions": {...}, "criteria": { "m1": { "move": "Nf6", "opponent_can_win": 0 }, ... } },
    "assessment": { "type": "score",  "criteria": ["Losing", "Worse", "Balanced", "Better", "Winning"] },
    "threat":     { "type": "noul",   "instructions": "The opponent has a concrete threat that must be answered this move." }
  }
}
```

The Choice distribution, the confidence and the Score are all shown live in the
sidebar while you play — the point of a calibrated decision model is that you
can watch it decide.

### Why you lost

When Jev wins, the game goes through a second decision. Code scans your moves
one ply deep and finds every one that dropped material; Jev then reads that
evidence, the clock and the move list, and picks the reason from ten
possibilities (`hung a piece`, `flagged on time`, `walked into mate`,
`slow squeeze`, …). Those answers are what the leaderboard aggregates.

---

## Setup

```bash
npm install
cp .env.example .env.local   # then add your key
npm run dev                  # http://localhost:3000
```

### The key

Set **one** of these in `.env.local`:

```bash
# Option A (default) — OpenRouter's Decisions API
OPENROUTER_API_KEY=sk-or-v1-...

# Option B — TypeSafe direct
TYPESAFE_API_KEY=...
```

The provider is auto-detected from whichever key is present, or forced with
`JEV_PROVIDER`. Both endpoints take the same body and return the same
`{answers, model, usage}` envelope, so only the URL, key and model slug differ:

| Provider | Endpoint | Default model |
| --- | --- | --- |
| `openrouter` | `POST https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.13` |
| `typesafe` | `POST https://api.typesafe.ai/v1/systemone` | `jev-latest` |

Override the slug with `JEV_MODEL` (e.g. `~typesafe/jev-latest`).

**Without a key the game still runs** — a small local negamax engine plays
instead, and a banner says so. That is also the fallback whenever Jev is slow,
rate-limited or unreachable mid-game, so a blitz game never stalls on a network
hiccup. `JEV_MOVE_TIMEOUT_MS` (default 4500) is how long Jev gets before the
local engine steps in.

The key is read server-side only, in Next.js route handlers. It never reaches
the browser.

---

## What gets played

Whatever Jev picks is what gets played, blunders included. There is no
difficulty setting in the UI: you are always facing the model's own judgment.

A guardrail mode still exists in `lib/jev.ts` — it plays an available mate in
one and filters out moves that hand the human mate in one. It is reachable by
posting `"difficulty": "guarded"` to `/api/jev/move`, and switching the UI back
to it is one line in `app/page.tsx`.

---

## Leaderboard

One SQLite file, one row per finished game (`data/jev-chess.db`, path set by
`JEV_CHESS_DB`). It tracks games played, Jev wins vs. human wins vs. draws, the
per-player standings, and the breakdown of *why* humans lose.

Submitted games are replayed server-side before they are stored: a claimed
checkmate that is not mate in the final position, or a result the moves do not
support, is rejected. Timeouts and resignations cannot be proven from the moves
and are taken at face value.

---

## Layout

```
app/
  page.tsx               the game
  leaderboard/page.tsx   aggregates, read straight from SQLite
  api/jev/move           one move  -> Jev decision (or local fallback)
  api/games              POST a finished game (verify, review, store) / GET the leaderboard
  api/health             tells the UI whether Jev is actually wired up
lib/
  decisions.ts           the Jev client, speaks both providers
  chess-core.ts          legal moves, annotation, shortlisting, local engine
  jev.ts                 state + questions for a move, guardrails
  review.ts              blunder scan + "why you lost" classification
  db.ts                  SQLite leaderboard
  types.ts               types shared between server and browser
components/              board, clocks, move list, Jev panel, result card
hooks/useChessGame.ts    game state machine and the blitz clock
```

## Design

The interface follows the conventions of a board-game client rather than a
dashboard: a warm-neutral dark canvas, the board as the brightest element on
the page, and the clock of the side to move rendered as a bright chip.

- **Surfaces** — panels sit only slightly above the canvas and are defined by a
  1px inset ring, not a drop shadow. Related content (the three sidebar
  sections, the five leaderboard stats) shares one surface split by dividers
  instead of becoming separate cards.
- **Tables** sit directly on the canvas with horizontal rules only, sentence-case
  headings, and a scroll wrapper so they never squeeze on a phone.
- **Buttons** come in exactly two heights: 36px for app chrome and 44px for the
  one primary action, which carries the pressed bottom edge you would expect
  from a board-game client. Only one primary button exists per screen; Resign is
  deliberately muted.
- **Type** is Inter with its variable axes and stylistic sets enabled. Body copy
  is 16px on mobile and steps down at 640px, never the other way round. Small
  uppercase labels are monospace and tracked, everywhere they appear.
- **The pieces** are the Cburnett vector set (`public/pieces/*.svg`), the same
  artwork lichess and Wikipedia use. Unicode chess glyphs were the first pass
  and are not viable: platforms disagree on whether the outline codepoints
  render filled or hollow, and several substitute a different font entirely, so
  the two sides can end up looking identical. Twelve SVGs are 48KB total and
  render the same everywhere. Artwork by Colin M.L. Burnett, CC BY-SA 3.0,
  credited in the footer.
- **The board** is fluid at every size: tap-to-move and drag both work, the grid
  is a plain square that fills its container, and everything inside it — piece
  size, coordinates, move hints — is a percentage of that. The player rows share
  the board's width so the clocks line up with its edges. On desktop the board
  is sized to the viewport height (`100dvh` minus the page chrome, capped at
  760px) so it fills the screen without ever pushing a clock below the fold.

Tested from 360px to 1512px. One deliberate deviation from the house design
rules: the header keeps its two text links on mobile instead of collapsing into
a hamburger, because two links fit comfortably at 360px and a menu would add a
tap for no gain.

---

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the build
npm run typecheck  # tsc --noEmit
```

## Notes and limits

- Jev is text-only and English is where it is strongest. Everything it sees
  here is English move annotations, so that is fine.
- Rate limits on the Decisions API are shared; a 429 is retried with backoff
  inside the move's latency budget, then the local engine plays.
- SQLite means one writable filesystem. For a serverless deploy, swap `lib/db.ts`
  for a hosted Postgres — it is the only file that touches storage.
