/**
 * The panel that opens beside a list when you pick a row.
 *
 * WHY THIS IS SHARED. Users needed one, Dealers needed the same one, and the
 * part worth sharing is not the content — it is the awkward part: it sits
 * beside the list on a wide screen and covers it on a narrow one, it closes
 * on Escape, and it moves focus when a different record is opened. Two copies
 * of that would drift, and the copy that drifts is the one nobody tests.
 *
 * NOT A DIALOG, deliberately. It never makes the list inert: picking the next
 * record straight from the list is the point of a list-and-detail screen, and
 * a modal would make you close this one first. The one modal behaviour worth
 * keeping — Escape — is added by hand rather than taken as a package deal.
 */

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./DetailPanel.module.css";

interface DetailPanelProps {
  /** Announced as the panel's name — usually the record's title. */
  label: string;

  /**
   * The id of the record on show. Focus moves into the panel when this
   * changes, so a keyboard user is taken to what they just asked for.
   *
   * An id rather than the record itself: a refetch makes a new object, and
   * that would yank focus back here while somebody was reading.
   */
  focusKey: string;

  onClose: () => void;

  /** Avatar, title, subtitle — whatever identifies this record. */
  header: ReactNode;
  children: ReactNode;
  /** Actions, pinned to the bottom. */
  footer?: ReactNode;
}

export function DetailPanel({
  label,
  focusKey,
  onClose,
  header,
  children,
  footer,
}: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [focusKey]);

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      // Focused programmatically, never tabbed to, so -1 rather than 0.
      tabIndex={-1}
      aria-label={label}
    >
      <header className={styles.header}>
        <div className={styles.headerContent}>{header}</div>

        <button type="button" className={styles.close} onClick={onClose} aria-label="Close details">
          <CloseIcon />
        </button>
      </header>

      <div className={styles.body}>{children}</div>

      {footer && <div className={styles.footer}>{footer}</div>}
    </aside>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path
        d="m3.5 3.5 7 7m0-7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
