/**
 * The organisation's people.
 *
 * A real `<table>` with `<th scope>`, not divs with ARIA roles. A screen
 * reader can then announce "row 3 of 6, Scope, Chennai — Guindy" as you move
 * about, which is the entire reason tabular data goes in a table.
 *
 * SCOPE IS A COLUMN, and it is the column that makes the model visible: most
 * people are organisation-wide, and the ones that are not are scoped to a
 * dealer inside DMS (C5). Somebody scanning this list should be able to see
 * at a glance who can see everything.
 */

import type { OrgUser } from "../api/users";
import { APP_CATALOG } from "../../navigation";
import styles from "./UserTable.module.css";

interface UserTableProps {
  users: OrgUser[];
}

export function UserTable({ users }: UserTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>
          Everyone in this organisation, with the apps they can open and their status
        </caption>

        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Scope</th>
            <th scope="col">Apps &amp; role</th>
            <th scope="col">Status</th>
          </tr>
        </thead>

        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <th scope="row" className={styles.personCell}>
                <span className={styles.avatar} aria-hidden="true">
                  {initials(user)}
                </span>

                <span className={styles.person}>
                  <span className={styles.nameLine}>
                    <span className={styles.name}>
                      {user.first_name} {user.last_name}
                    </span>
                    {/* Only the owner is marked. "Member" on everybody else
                        would be noise on the majority of rows. */}
                    {user.role === "owner" && <span className={styles.ownerBadge}>Owner</span>}
                    {user.role === "admin" && <span className={styles.adminBadge}>Admin</span>}
                  </span>
                  <span className={styles.email}>{user.email}</span>
                </span>
              </th>

              <td>
                {user.unit_name ? (
                  <span className={styles.unit}>{user.unit_name}</span>
                ) : (
                  /*
                   * Worth stating rather than leaving blank. An empty cell
                   * reads as missing data; "Organisation" is the actual
                   * answer, and it is the wider of the two scopes.
                   */
                  <span className={styles.orgScope}>Organisation</span>
                )}
              </td>

              <td>
                {user.apps.length === 0 ? (
                  <span className={styles.noApps}>No apps</span>
                ) : (
                  <ul className={styles.appList}>
                    {user.apps.map((entry) => (
                      <li key={entry.app} className={styles.appEntry}>
                        <span className={styles.appName}>{appName(entry.app)}</span>
                        <span className={styles.appRole}>{entry.role}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>

              <td>
                <StatusPill status={user.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: OrgUser["status"] }) {
  /*
   * Colour is never the only signal — each pill says its state in words too.
   * Roughly one man in twelve cannot separate the green from the amber.
   */
  const label =
    status === "active" ? "Active" : status === "invited" ? "Invitation sent" : "Disabled";

  return (
    <span className={styles.status} data-status={status}>
      {label}
    </span>
  );
}

/**
 * The app's display name, falling back to whatever the server called it.
 *
 * A key the frontend has not heard of still renders — the backend can add an
 * app before this release knows how to draw it, and a blank cell would be a
 * worse answer than the raw key.
 */
function appName(key: string): string {
  return APP_CATALOG.find((app) => app.key === key)?.name ?? key;
}

function initials(user: OrgUser): string {
  const letters = [user.first_name, user.last_name]
    .map((part) => part.trim()[0])
    .filter((letter): letter is string => Boolean(letter));

  // Someone invited but not yet named has neither, so fall back to the email
  // rather than rendering an empty circle.
  return (letters.length > 0 ? letters.join("") : user.email.slice(0, 2)).toUpperCase();
}
