/**
 * The Users list (C78): name and email, how many apps, and a ⋮ — in the same
 * format as every Admin panel list page (`ListPage.module.css`).
 *
 * THE OWNER'S COLUMNS (2026-11-17), replacing Role and Status. What somebody
 * does in each app, and their standing, are one click away in the panel; a
 * pending or inactive person carries a tag beside their name, so the state the
 * filter chooses is still visible under "All users".
 *
 * The ⋮ is `UserActions`, the same one the panel's header carries.
 */

import { useState } from "react";
import { Link } from "react-router-dom";

import type { Membership } from "../../api/auth";
import type { OrgUser } from "../api/users";
import styles from "../screens/ListPage.module.css";
import { UserActions, displayName } from "./UserActions";

interface UserTableProps {
  users: OrgUser[];
  membership: Membership;
  basePath: string;
  selectedId: string | undefined;
  onSelect: (userId: string) => void;
  /** After somebody is deleted: closes their panel if it was open. */
  onRemoved: (userId: string) => void;
  /**
   * What to say when there are no rows to show ("No active users match …").
   * Drawn INSIDE the table's card, under its headings, as Applications and
   * Admins do — not below the card, which left an empty heading strip
   * floating over a message on the page background.
   */
  emptyText: string;
}

export function UserTable({
  users,
  membership,
  basePath,
  selectedId,
  onSelect,
  onRemoved,
  emptyText,
}: UserTableProps) {
  const [statusError, setStatusError] = useState<string | null>(null);

  return (
    <>
      {statusError && (
        <p className={styles.missing} role="alert">
          {statusError}
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.visuallyHidden}>
            Everyone in this organisation. Select a person to see their apps and scope.
          </caption>

          <thead>
            <tr>
              <th scope="col">Name / Email address</th>
              <th scope="col" className={styles.number}>
                Apps
              </th>
              <th scope="col" className={styles.actions}>
                <span className={styles.visuallyHidden}>Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className={styles.row}
                data-open={user.id === selectedId || undefined}
                onClick={() => onSelect(user.id)}
              >
                <th scope="row">
                  <div className={styles.entity}>
                    <span className={styles.badge} aria-hidden="true">
                      {initials(user)}
                    </span>
                    <div className={styles.stack}>
                      <Link
                        to={`${basePath}/${user.id}`}
                        className={styles.primary}
                        aria-current={user.id === selectedId ? "page" : undefined}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {displayName(user)}
                      </Link>
                      <span className={styles.sub}>{user.email}</span>
                    </div>
                    {user.status === "invited" && <span className={styles.tag}>Pending</span>}
                    {user.status === "disabled" && <span className={styles.tag}>Inactive</span>}
                  </div>
                </th>

                <td className={styles.number}>{user.apps.length}</td>

                {/* Stops clicks from the ⋮ menu and its dialogs (portals, which
                    React still bubbles) reaching the row and selecting it. */}
                <td className={styles.actions} onClick={(event) => event.stopPropagation()}>
                  <UserActions
                    user={user}
                    membership={membership}
                    onRemoved={() => onRemoved(user.id)}
                    onStatusError={setStatusError}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && <p className={styles.empty}>{emptyText}</p>}
      </div>
    </>
  );
}

export function initials(user: Pick<OrgUser, "first_name" | "last_name" | "email">): string {
  const letters = [user.first_name, user.last_name]
    .map((part) => part.trim()[0])
    .filter((letter): letter is string => Boolean(letter));

  // Someone invited but not yet named has neither, so fall back to the email
  // rather than rendering an empty circle.
  return (letters.length > 0 ? letters.join("") : user.email.slice(0, 2)).toUpperCase();
}
