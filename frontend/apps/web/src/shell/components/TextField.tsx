/**
 * Label + input + error, wired together correctly.
 *
 * The accessibility is the whole point of having this as a component. Done by
 * hand on each form, someone forgets `htmlFor`, and now clicking the label does
 * not focus the input and a screen reader announces the field as unlabelled.
 *
 * Three things it gets right every time:
 *   - `htmlFor` / `id` matched, so label and input are associated
 *   - `aria-invalid`, so assistive tech knows the field is wrong rather than
 *     just that some red text exists nearby
 *   - `aria-describedby` pointing at the error, so the message is read out when
 *     the field is focused instead of sitting there unnoticed
 *
 * Used twice on this screen and eventually by every form in the product. It
 * still stays in `shell/` until a second module needs it — the rule of two.
 */

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import styles from "./TextField.module.css";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Message from Zod or from the server. Its presence marks the field invalid. */
  error?: string;
  /** Rendered to the right of the label — "Forgot password?" and the like. */
  action?: ReactNode;
}

/*
 * `required` comes from InputHTMLAttributes and does two jobs here: it marks
 * the field for assistive tech, which announces "required" when you reach it,
 * and it draws the asterisk. The browser still will not block submission —
 * every form here sets `noValidate` so the messages are ours and consistent
 * rather than each browser's own wording.
 */

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, action, id, required, ...inputProps },
  ref,
) {
  // React Hook Form hands us a ref, so forwardRef is required: without it the
  // library cannot focus this input when validation fails.
  const inputId = id ?? "field-" + label.toLowerCase().replace(/\s+/g, "-");
  const errorId = inputId + "-error";

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && (
            <>
              {/* Hidden from screen readers: the input's own `required` already
                  announces it, and an asterisk read aloud as "star" is noise. */}
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            </>
          )}
        </label>
        {action}
      </div>

      <input
        {...inputProps}
        id={inputId}
        ref={ref}
        required={required}
        className={error ? styles.input + " " + styles.inputInvalid : styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />

      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
});
