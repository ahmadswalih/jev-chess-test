"use client";

import { useEffect, useRef } from "react";

export default function MoveList({ history }: { history: string[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Keep the latest move visible by scrolling the list itself.
   *
   * Not `scrollIntoView`: that walks up every scrollable ancestor including
   * the document, so on a phone -- where this panel sits below the board --
   * every move would drag the whole page down to the move list and take the
   * board off screen. Setting `scrollTop` moves only this element.
   */
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [history.length]);

  const pairs: { number: number; white?: string; black?: string }[] = [];
  history.forEach((san, index) => {
    const moveNumber = Math.floor(index / 2) + 1;
    if (index % 2 === 0) pairs.push({ number: moveNumber, white: san });
    else pairs[pairs.length - 1].black = san;
  });

  return (
    <section className="panel-section">
      <div className="panel-title">
        <span>Moves</span>
        <span>{pairs.length}</span>
      </div>
      {pairs.length === 0 ? (
        <p className="empty">No moves yet.</p>
      ) : (
        <div className="moves" ref={listRef}>
          {pairs.map((pair, index) => (
            <div className="moves-row" key={pair.number}>
              <span className="moves-num">{pair.number}.</span>
              <span
                className="moves-san"
                data-latest={index === pairs.length - 1 && history.length % 2 === 1}
              >
                {pair.white}
              </span>
              <span
                className="moves-san"
                data-latest={index === pairs.length - 1 && history.length % 2 === 0}
              >
                {pair.black ?? ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
