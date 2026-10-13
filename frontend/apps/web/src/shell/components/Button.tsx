/**
 * One button, three looks.
 *
 * `isLoading` disables as well as showing the spinner. On a login form that is
 * not cosmetic: a double submit is how someone trips the server's own rate
 * limiter and locks themselves out of their own account.
 */

import type { ButtonHTMLAttributes } from "react";

import styles from "./Button.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  isLoading?: boolean;
}

export function Button({
  variant = "primary",
  isLoading = false,
  disabled,
  children,
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      {...buttonProps}
      className={styles.button + " " + styles[variant]}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading && (
        <svg
          className={styles.spinner}
          width="15"
          height="15"
          viewBox="0 0 15 15"
          aria-hidden="true"
        >
          <circle
            cx="7.5"
            cy="7.5"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="2"
          />
          <path
            d="M13.5 7.5a6 6 0 00-6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
