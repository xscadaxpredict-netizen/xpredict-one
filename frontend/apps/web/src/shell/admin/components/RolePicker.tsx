/**
 * "What are they in this app?" — one app, one answer.
 *
 * Shared by the invite and edit dialogs. A role picker copied into two forms
 * is a rule that will disagree with itself the first time somebody edits one
 * of them, and the disagreement here would be which roles are legal at which
 * scope — a difference nobody sees until a record the backend refuses.
 *
 * ALWAYS A SELECT, so granting a role is visibly something the person did.
 * It used to state the role as a line of text whenever only one was possible,
 * which read as the form deciding rather than the admin assigning.
 *
 * WHAT CHANGES WITH THE NUMBER OF OPTIONS IS THE DEFAULT, not the control:
 *
 *   one option   — preselected. There is no decision to make, so making
 *                  somebody confirm it would be the wasted question C23 warns
 *                  about.
 *   several      — starts on "Select a role…" and the form refuses to submit
 *                  until one is chosen. Defaulting to the first would quietly
 *                  grant whatever happens to head the list — and the list is
 *                  ordered most-capable first, so the silent default would be
 *                  the most powerful role. Fail closed instead.
 *
 * NEVER RENDERS NOTHING. No options at all means the role list has not
 * arrived, or the backend has an app this frontend does not know the roles
 * for. Silence there would look like the app had no roles, so it says so.
 */

import type { Role } from "../api/roles";
import styles from "./RolePicker.module.css";

interface RolePickerProps {
  /** The app this is about, for the label and the field id. */
  appName: string;
  appKey: string;
  /** The roles legal for this app at the scope already chosen. */
  options: Role[];
  value: string;
  onChange: (roleCode: string) => void;
}

export function RolePicker({ appName, appKey, options, value, onChange }: RolePickerProps) {
  const id = `role-${appKey}`;

  if (options.length === 0) {
    return (
      <p className={styles.note}>
        <strong>{appName}</strong> — loading roles…
      </p>
    );
  }

  const chosen = options.find((role) => role.code === value);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        Role in {appName}
      </label>

      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {/*
          Only when nothing is chosen yet, and only when there was a choice to
          make — a single-option app arrives preselected, so this never appears
          for it and nobody is asked to confirm the obvious.
        */}
        {!value && <option value="">Select a role…</option>}
        {options.map((role) => (
          <option key={role.code} value={role.code}>
            {role.name}
          </option>
        ))}
      </select>

      {/*
        The chosen role's own summary, not a generic hint. "Sales executive"
        does not say whether that covers job cards, and the person assigning it
        is usually not the person who will do the job.
      */}
      {chosen && <p className={styles.hint}>{chosen.summary}</p>}
    </div>
  );
}
