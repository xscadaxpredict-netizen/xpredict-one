/**
 * One person, in full: scope, app access, and what you can do to them.
 *
 * WHY THIS EXISTS. The list used to carry scope and apps as columns, which
 * made it 720px wide and pushed a phone into sideways scrolling. Scanning a
 * list and reading one record are different jobs — the list answers "who is
 * here and are they switched on", and everything else belongs to the row you
 * picked.
 *
 * The chrome — beside the list or over it, Escape, focus — is `DetailPanel`
 * in packages/ui, shared with Dealers. Only the content is here.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { asProblem } from "@xpredict/api-client";
import { DetailPanel } from "@xpredict/ui";

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
  const { mutate: setStatus, isPending: statusPending, error: statusError } = useSetUserStatus();
  const { mutate: resend, isPending: resendPending, isSuccess: resent } = useResendInvitation();

  const isDisabled = user.status === "disabled";
  const fullName = `${user.first_name} ${user.last_name}`;

  return (
    <DetailPanel
      label={fullName}
      focusKey={user.id}
      onClose={onClose}
      header={
        <>
          <span className={styles.avatar} aria-hidden="true">
            {initials(user)}
          </span>

          <div className={styles.identity}>
            <h2 className={styles.name}>{fullName}</h2>
            <p className={styles.email}>{user.email}</p>
          </div>
        </>
      }
      footer={
        <>
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
        </>
      }
    >
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

      {/*
        Deliberately no Edit button yet. What is editable is not settled: name
        and email are straightforward, but role and app access are exactly what
        Q11 and Q12 are about, and an Edit that changes only a name would be
        the wrong shape to grow from.
      */}
    </DetailPanel>
  );
}

/** The app's display name, falling back to whatever the server called it. */
function appName(key: string): string {
  return APP_CATALOG.find((app) => app.key === key)?.name ?? key;
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
