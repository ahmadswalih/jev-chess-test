/**
 * The social card, generated rather than hand-drawn.
 *
 * Next renders this with Satori at build time, so the image always matches the
 * product's colours and copy instead of drifting from a PNG somebody exported
 * once. Satori supports flexbox only -- no CSS grid -- and needs real image
 * data, so the pieces are inlined from `public/pieces` as data URIs.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Jev Chess — one minute blitz against Jev, a decision model";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LIGHT = "#ebecd0";
const DARK = "#739552";
const CANVAS = "#262421";
const ACCENT = "#81b64c";

function piece(name: string): string {
  const svg = readFileSync(join(process.cwd(), "public", "pieces", `${name}.svg`));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

/** Back rank plus a pawn row, the shape everyone recognises as a chess board. */
const LAYOUT: (string | null)[][] = [
  ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"],
  ["bp", "bp", "bp", "bp", "bp", "bp", "bp", "bp"],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, "wp", null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ["wp", "wp", "wp", "wp", null, "wp", "wp", "wp"],
  ["wr", "wn", "wb", "wq", "wk", "wb", "wn", "wr"],
];

export default async function Image() {
  const square = 58;
  const sprites = new Map<string, string>();
  for (const row of LAYOUT) {
    for (const name of row) {
      if (name && !sprites.has(name)) sprites.set(name, piece(name));
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: CANVAS,
          color: "#f5f4f2",
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: the pitch */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 0 0 64px",
            width: 660,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 28,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 8,
                background: DARK,
                marginRight: 14,
              }}
            >
              <img src={sprites.get("bn")} width={34} height={34} alt="" />
            </div>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>Jev Chess</div>
          </div>

          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2.5,
              marginBottom: 22,
            }}
          >
            One minute each.
          </div>

          <div style={{ fontSize: 29, lineHeight: 1.4, color: "#b3afa8", marginBottom: 34 }}>
            Blitz against a model that doesn&apos;t generate moves — it judges between them.
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: ACCENT,
                  color: "#1b2410",
                  fontSize: 24,
                  fontWeight: 700,
                  padding: "13px 24px",
                  borderRadius: 7,
                }}
              >
                beatjev.loopengine.tech
              </div>
            </div>
            <div style={{ display: "flex", fontSize: 20, color: "#8b8781", marginTop: 16 }}>
              Powered by loopengine.tech
            </div>
          </div>
        </div>

        {/* Right: the board, bled off the edge */}
        <div style={{ display: "flex", alignItems: "center", paddingLeft: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {LAYOUT.map((row, r) => (
              <div key={r} style={{ display: "flex" }}>
                {row.map((name, c) => (
                  <div
                    key={c}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: square,
                      height: square,
                      background: (r + c) % 2 === 0 ? LIGHT : DARK,
                    }}
                  >
                    {name ? (
                      <img src={sprites.get(name)} width={square} height={square} alt="" />
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
