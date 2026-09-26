/**
 * One person, in full: scope, app access, and what you can do to them.
 *
 * WHY THIS EXISTS. The list used to carry scope and apps as columns, which
 * made it 720px wide and pushed a phone into sideways scrolling. Scanning a
 * list and reading one record are different jobs — the list answers "who is
 * here and are they switched on", and everything else belongs to the row you
 * picked.
 *
 * DRIVEN BY THE URL, not by state. `/admin/users/:userId` — so the back button
 * closes it, a link to one person can be pasted into a message, and a refresh
 * keeps the panel open. A `selectedUser` in `useState` would do none of that
 * and would disagree with the address bar the first time somebody used Back.
 *
 * NOT A DIALOG. It sits beside the list on a wide screen and covers it on a
 * narrow one, but it never makes the list inert: picking the next person
 * straight from the list is the whole point of a list-and-detail screen, and
 * a modal would make you close this one first.
 */

import { useEffect, useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { asProblem } from "@xpredict/api-client";

import type { OrgUser } from "../api/users";
import { APP_CATALOG } from "../../navigation";
import { useResendInvitation, useSetUserStatus } from "../hooks/useUsers";
import { initials } from "./UserTable";
import styles from "./UserDetailPanel.module.css";

interface UserDetailPanelProps {
  user: OrgUser;
  onClose: () => void;
}

export function UserDetailPanel({ user, onClose }: UserDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { mutate: setStatus, isPending: statusPending, error: statusError } = useSetUserStatus();
  const { mutate: resend, isPending: resendPending, isSuccess: resent } = useResendInvitation();

  /*
   * Escape closes it. A dialog would give this for free, but this panel is
   * deliberately not one — so the one behaviour worth keeping is added by hand
   * rather than making the list inert to get it.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  /*
   * Move focus into the panel when a different person is opened, so a keyboard
   * user is taken to what they just asked for rather than left in the table.
   * `user.id` in the deps, not `user`: a refetch makes a new object and would
   * otherwise yank focus back here while someone was reading.
   */
  useEffect(() => {
    panelRef.current?.focus();
  }, [user.id]);

  const isDisabled = user.status === "disabled";

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      tabIndex={-1}
      aria-label={`${user.first_name} ${user.last_name}`}
    >
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(user)}
        </span>

        <div className={styles.identity}>
          <h2 className={styles.name}>
            {user.first_name} {user.last_name}
          </h2>
          <p className={styles.email}>{user.email}</p>
        </div>

        <button type="button" className={styles.close} onClick={onClose} aria-label="Close details">
          <CloseIcon />
        </button>
      </header>

      <div className={styles.pills}>
        <span className={styles.status} data-status={user.status}>
          {user.status === "active"
            ? "Active"
            : user.status === "invited"
              ? "Invitation sent"
              : "Disabled"}
        </span>
        <span className={styles.role}>
          {user.role === "owner" ? "Owner" : user.role === "admin" ? "Admin" : "Member"}
        </span>
      </div>

      <dl className={styles.facts}>
        <dt>Scope</dt>
        <dd>
          {user.unit_name ? (
            <>
              <span className={styles.unit}>{user.unit_name}</span>
              {/* Says which app the scope applies to. A dealer name on its own
                  reads as though it limits everything they can do. */}
              <span className={styles.note}>Their DMS records are limited to this dealer.</span>
            </>
          ) : (
            <>
              <span className={styles.orgScope}>Organisation</span>
              <span className={styles.note}>Not limited to any one dealer.</span>
            </>
          )}
        </dd>

        <dt>Apps</dt>
        <dd>
          {user.apps.length === 0 ? (
            <span className={styles.note}>No apps yet. They cannot open anything.</span>
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
        </dd>
      </dl>

      {statusError && (
        <p className={styles.error} role="alert">
          {asProblem(statusError).detail}
        </p>
      )}

      <div className={styles.actions}>
        {user.status === "invited" && (
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={resendPending || resent}
            onClick={() => resend(user.id)}
          >
            {resent ? "Invitation sent" : resendPending ? "Sending…" : "Resend invitation"}
          </button>
        )}

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={styles.moreTrigger} aria-label="More actions">
            <MoreIcon />
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
              <DropdownMenu.Item
                className={styles.menuItem}
                disabled={statusPending || user.role === "owner"}
                onSelect={() =>
                  setStatus({ userId: user.id, status: isDisabled ? "active" : "disabled" })
                }
              >
                {isDisabled ? "Reactivate" : "Mark as inactive"}
              </DropdownMenu.Item>

              {/*
                The owner cannot be switched off from here. An organisation
                with no owner has nobody who can appoint one, and the backend
                refuses it anyway (C14) — so the control is disabled rather
                than offered and then rejected.
              */}
              {user.role === "owner" && (
                <p className={styles.menuNote}>The owner cannot be deactivated.</p>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/*
        Deliberately no Edit button yet. What is editable is not settled: name
        and email are straightforward, but role and app access are exactly what
        Q11 and Q12 are about, and an Edit that changes only a name would be
        the wrong shape to grow from.
      */}
    </aside>
  );
}

/** The app's display name, falling back to whatever the server called it. */
function appName(key: string): string {
  return APP_CATALOG.find((app) => app.key === key)?.name ?? key;
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path
        d="m3.5 3.5 7 7m0-7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
    </svg>
  );
}
