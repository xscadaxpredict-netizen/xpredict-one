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
  /**
   * A rule the server will enforce, said BEFORE the round trip.
   *
   * Added for the password rules, which are Django's and cannot all be checked
   * in the browser — "is this a common password" needs the list. Somebody
   * typing 12345678 should learn it will be refused while they are typing it,
   * not after a request that comes back saying so.
   */
  hint?: ReactNode;
}

/*
 * `required` comes from InputHTMLAttributes and does two jobs here: it marks
 * the field for assistive tech, which announces "required" when you reach it,
 * and it draws the asterisk. The browser still will not block submission —
 * every form here sets `noValidate` so the messages are ours and consistent
 * rather than each browser's own wording.
 */

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, action, hint, id, required, ...inputProps },
  ref,
) {
  // React Hook Form hands us a ref, so forwardRef is required: without it the
  // library cannot focus this input when validation fails.
  const inputId = id ?? "field-" + label.toLowerCase().replace(/\s+/g, "-");
  const errorId = inputId + "-error";
  const hintId = inputId + "-hint";

  /*
   * THE ERROR WINS WHEN BOTH EXIST. Pointing `aria-describedby` at both reads
   * the rule out and then the failure, which is the rule twice over for
   * somebody listening; once a field is wrong, what is wrong with it is the
   * only part worth announcing.
   */
  const describedBy = error ? errorId : hint ? hintId : undefined;

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
        aria-describedby={describedBy}
      />

      {/* Hidden once the field is wrong, so the rule is not sitting under the
          message explaining that the rule was broken. */}
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
});
