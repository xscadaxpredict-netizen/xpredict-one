/**
 * The error across the top of a form — for problems belonging to the whole
 * submission rather than to one field. "Email or password is incorrect" cannot
 * point at a field, because saying which one was wrong is itself the leak.
 *
 * `role="alert"` makes a screen reader announce it the moment it appears.
 * Without it a blind user submits, hears nothing, and has no idea why the page
 * did not move.
 */

import type { ReactNode } from "react";

import styles from "./FormBanner.module.css";

interface FormBannerProps {
  children: ReactNode;
  /** Shown small and muted, for support to quote. Only on unexpected failures. */
  traceId?: string;
}

export function FormBanner({ children, traceId }: FormBannerProps) {
  return (
    <div className={styles.banner} role="alert">
      <svg
        className={styles.icon}
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 4.5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className={styles.body}>
        <div>{children}</div>
        {traceId && <code className={styles.trace}>{traceId}</code>}
      </div>
    </div>
  );
}
