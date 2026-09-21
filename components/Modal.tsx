"use client";

/**
 * Dismissible dialog used for the pre-game setup and the result card.
 *
 * Closing is always optional from the caller's side, but when it is offered it
 * works three ways -- the close button, Escape, and a click on the backdrop --
 * so nobody is ever trapped in front of the board they wanted to look at.
 */

import { useEffect } from "react";

interface Props {
  onClose?: () => void;
  /** Accessible name for the dialog. */
  label: string;
  children: React.ReactNode;
}

export default function Modal({ onClose, label, children }: Props) {
  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onPointerDown={(event) => {
        if (onClose && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-shell">
        {onClose && (
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
