/**
 * The centred card used by every signed-out page — sign in, forgot password,
 * accept invitation.
 *
 * Deliberately not a split screen with a brand panel: this is the page people
 * spend the least time on, and half a screen of decoration is half a screen
 * that has to be kept in sync with the rest of the product forever.
 */

import type { ReactNode } from "react";

import styles from "./AuthLayout.module.css";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.mark} aria-hidden="true">
              X
            </div>
            <span className={styles.brandName}>Xpredict One</span>
          </div>
          <div className={styles.titleBlock}>
            {/* One h1 per page: screen-reader users navigate by heading. */}
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>

        {children}

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
