/**
 * Piece artwork.
 *
 * These are the Cburnett vector pieces -- the set lichess and Wikipedia use --
 * served as twelve SVG files from `public/pieces`. They replace the Unicode
 * chess glyphs, which render differently on every platform (some fill the
 * outline forms, some leave them hollow, some substitute another font
 * entirely) and read as text rather than as a board.
 *
 * Artwork by Colin M.L. Burnett, CC BY-SA 3.0.
 * https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces
 */

import type { Color, PieceSymbol } from "chess.js";

export function pieceSrc(colour: Color, type: PieceSymbol): string {
  return `/pieces/${colour}${type}.svg`;
}

export const PIECE_LABEL: Record<PieceSymbol, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

export function pieceAlt(colour: Color, type: PieceSymbol): string {
  return `${colour === "w" ? "white" : "black"} ${PIECE_LABEL[type]}`;
}
