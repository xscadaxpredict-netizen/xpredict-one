/**
 * The non-populated states, as components.
 *
 * These are the first things that get skipped under deadline and the first
 * things users hit. Keeping them as named components makes their absence
 * obvious in review — a screen with no `<ErrorState />` did not handle errors.
 *
 * Candidates for promotion to `packages/ui`: the moment a second module needs
 * them, move them there. Not before — a shared component designed from one use
 * case grows a prop per caller. Two real callers is the smallest number that
 * shows you its actual shape.
 */

import styles from "./states.module.css";

// ---------------------------------------------------------------------------

interface EnquiryTableSkeletonProps {
  rows?: number;
}

/**
 * A skeleton shaped like the table that is coming, not a centred spinner.
 * A spinner sits in the middle of an empty box and then throws every row down
 * the page the moment data lands; a skeleton holds the layout still.
 */
export function EnquiryTableSkeleton({ rows = 6 }: EnquiryTableSkeletonProps) {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>Loading enquiries</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonCell} style={{ width: "96px" }} />
          <div className={styles.skeletonCell} style={{ flexGrow: 1 }} />
          <div className={styles.skeletonCell} style={{ width: "88px" }} />
          <div className={styles.skeletonCell} style={{ width: "72px" }} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, body, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className={styles.centered}>
      <h2 className={styles.stateTitle}>{title}</h2>
      <p className={styles.stateBody}>{body}</p>
      {actionLabel && (
        <button type="button" className={styles.stateAction} onClick={onAction}>
          {actionLabel}
        </button>
      )}
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
  not_permitted: "You do not have permission to view these enquiries.",
  internal_error: "Something went wrong at our end. Try again in a moment.",
};

interface ErrorStateProps {
  code: string;
  traceId: string;
  onRetry: () => void;
}

export function ErrorState({ code, traceId, onRetry }: ErrorStateProps) {
  const message = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.internal_error;

  return (
    <div className={styles.centered} role="alert">
      <h2 className={styles.stateTitle}>Could not load enquiries</h2>
      <p className={styles.stateBody}>{message}</p>
      <button type="button" className={styles.stateAction} onClick={onRetry}>
        Try again
      </button>
      {/* Selectable, so someone can paste it into a support message. It is the
          only way to find the real error: the 5xx body deliberately says nothing. */}
      {traceId && <code className={styles.traceId}>{traceId}</code>}
    </div>
  );
}
