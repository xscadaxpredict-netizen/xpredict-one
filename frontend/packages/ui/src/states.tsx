/**
 * Loading, empty and error — the three states every list screen needs and the
 * three that get skipped under deadline.
 *
 * WHY THESE ARE HERE NOW. They were written for the Sales enquiry list with a
 * note saying "promote the moment a second module needs them". The
 * Administration user list is that second module, so this is the promotion —
 * generic where the originals were enquiry-specific, and nothing more, because
 * a shared component designed from one use case grows a prop per caller.
 *
 * Keeping them as named components makes their absence obvious in review: a
 * screen with no `<ErrorState />` did not handle errors.
 */

import type { ReactNode } from "react";

import styles from "./states.module.css";

// ---------------------------------------------------------------------------

interface TableSkeletonProps {
  /**
   * Relative column widths, so the skeleton is the shape of the table that is
   * coming. `1` grows to fill; a number of pixels stays fixed.
   */
  columns: (number | "grow")[];
  rows?: number;
  /** What is loading, for screen readers. "users", "enquiries". */
  label: string;
}

/**
 * A skeleton shaped like the table that is coming, not a centred spinner.
 *
 * A spinner sits in the middle of an empty box and then throws every row down
 * the page the moment data lands. A skeleton holds the layout still, so the
 * thing you were about to click does not move out from under you.
 */
export function TableSkeleton({ columns, rows = 6, label }: TableSkeletonProps) {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>Loading {label}</span>

      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className={styles.skeletonRow}>
          {columns.map((width, columnIndex) => (
            <div
              key={columnIndex}
              className={styles.skeletonCell}
              style={width === "grow" ? { flexGrow: 1 } : { width: `${String(width)}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title: string;
  body: string;
  /**
   * The way out. Optional because the two empty states are different screens:
   * "nothing exists yet" offers to create the first one, "nothing matched your
   * filter" must not — the data exists, the filter is the problem, so the exit
   * is to widen it rather than to add another record.
   */
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.centered}>
      <h2 className={styles.stateTitle}>{title}</h2>
      <p className={styles.stateBody}>{body}</p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Messages keyed by the backend's `code`, never by its `detail`.
 *
 * `code` is the contract; `detail` is prose the backend may reword at any
 * release. Matching on message text breaks silently, in production, months
 * later. Add a case here when the backend adds a code.
 */
const ERROR_MESSAGES: Record<string, string> = {
  network_error: "Could not reach the server. Check your connection.",
  not_authenticated: "Your session has ended. Sign in again.",
  not_permitted: "You do not have permission to view this.",
  internal_error: "Something went wrong at our end. Try again in a moment.",
};

interface ErrorStateProps {
  /** What failed, in the caller's words: "Could not load users". */
  title: string;
  code: string;
  traceId?: string;
  onRetry: () => void;
}

export function ErrorState({ title, code, traceId, onRetry }: ErrorStateProps) {
  const message = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.internal_error;

  return (
    <div className={styles.centered} role="alert">
      <h2 className={styles.stateTitle}>{title}</h2>
      <p className={styles.stateBody}>{message}</p>

      <button type="button" className={styles.stateAction} onClick={onRetry}>
        Try again
      </button>

      {/* Selectable, so someone can paste it into a support message. It is the
          only way to find the real error: a 5xx body deliberately says nothing,
          because constraint names and stack traces disclose another
          organisation's data shape as readily as this one's. */}
      {traceId && <code className={styles.traceId}>{traceId}</code>}
    </div>
  );
}
