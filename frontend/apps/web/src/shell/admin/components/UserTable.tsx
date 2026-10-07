/**
 * The organisation's people: person, role, status. Nothing else.
 *
 * IT USED TO CARRY SCOPE AND APPS TOO, and at four columns of real content it
 * needed 720px and scrolled sideways on anything smaller. Scanning a list of
 * people is a different job from reading one of them: the list answers "who
 * is here and are they switched on", and everything else belongs to the row
 * you picked. Both now live in the detail panel.
 *
 * A real `<table>` with `<th scope>`, not divs with ARIA roles — a screen
 * reader can then announce "row 3 of 7, Role, Admin" as you move about, which
 * is the entire reason tabular data goes in a table.
 *
 * THE LINK IS THE NAME, not the row. A `<tr onClick>` is invisible to the
 * keyboard and announces nothing; a real link is focusable, reachable by tab,
 * works with middle-click and can be copied. The row's own click handler is a
 * convenience layered on top, and it goes to the same place, so a stray double
 * fire changes nothing.
 */

import { Link } from "react-router-dom";

import type { OrgUser } from "../api/users";
import styles from "./UserTable.module.css";

interface UserTableProps {
  users: OrgUser[];
  /** Base path for a person's detail, e.g. `/acme-motors/admin/users`. */
  basePath: string;
  /** The person currently open in the detail panel, if any. */
  selectedId: string | undefined;
  onSelect: (userId: string) => void;
}

export function UserTable({ users, basePath, selectedId, onSelect }: UserTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>
          Everyone in this organisation. Select a person to see their apps and scope.
        </caption>

        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
          </tr>
        </thead>

        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className={styles.row}
              data-selected={user.id === selectedId || undefined}
              onClick={() => onSelect(user.id)}
            >
              <th scope="row" className={styles.personCell}>
                <span className={styles.personLayout}>
                  <span className={styles.avatar} aria-hidden="true">
                    {initials(user)}
                  </span>

                  <span className={styles.person}>
                    <Link
                      to={`${basePath}/${user.id}`}
                      className={styles.name}
                      // The row handler fires too; stopping it here would mean
                      // the link and the row disagreed about what a click does.
                      onClick={(event) => event.stopPropagation()}
                    >
                      {user.first_name} {user.last_name}
                    </Link>
                    <span className={styles.email}>{user.email}</span>
                  </span>
                </span>
              </th>

              <td>
                <RolePill role={user.role} />
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

/**
 * Standing in the organisation, and ONLY standing — Owner, Admin or Member.
 *
 * THE COLUMN USED TO ALSO LIST APP ROLES, and the owner asked for them out:
 * the detail panel already shows what somebody does in each app, and a list
 * is for scanning rather than for reading a person's whole grant.
 *
 * WHAT IS GIVEN UP, so nobody rediscovers it as a surprise: a dealer admin
 * and a salesperson at the same dealership both read "Member" here, because
 * C40 made standing and app roles independent and a dealer admin's power
 * comes from the DMS System administrator role rather than from standing.
 * Telling them apart is a click into the person. That is the owner's call,
 * made knowing the trade.
 */
function RolePill({ role }: { role: OrgUser["role"] }) {
  const label = role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";

  return (
    <span className={styles.role} data-role={role}>
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: OrgUser["status"] }) {
  /*
   * Colour is never the only signal — each pill says its state in words too.
   * Roughly one man in twelve cannot separate the green from the amber, and
   * "is this person switched off" is not a guess worth making.
   */
  const label =
    status === "active" ? "Active" : status === "invited" ? "Invitation sent" : "Disabled";

  return (
    <span className={styles.status} data-status={status}>
      {label}
    </span>
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
