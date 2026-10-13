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

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { asProblem } from "@xpredict/api-client";
import { DetailPanel } from "@xpredict/ui";

import type { Membership } from "../../api/auth";
import { administersLabel } from "../administers";
import type { OrgUser } from "../api/users";
import { APP_CATALOG } from "../../navigation";
import { useResendInvitation, useSetUserStatus } from "../hooks/useUsers";
import { EditUserDialog } from "./EditUserDialog";
import { InviteLinkPanel } from "./InviteLinkPanel";
import { RemoveUserDialog } from "./RemoveUserDialog";
import { initials } from "./UserTable";
import styles from "./UserDetailPanel.module.css";

interface UserDetailPanelProps {
  user: OrgUser;
  /** The signed-in person's membership — what they may change depends on it. */
  membership: Membership;
  onClose: () => void;
}

export function UserDetailPanel({ user, membership, onClose }: UserDetailPanelProps) {
  const { mutate: setStatus, isPending: statusPending, error: statusError } = useSetUserStatus();
  const { mutate: resend, isPending: resendPending, isSuccess: resent } = useResendInvitation();

  /*
   * The link is not shown until an admin asks for it. It carries the token
   * that joins the organisation as this person, so it is fetched on a press
   * rather than sitting in the panel for everybody who clicks a row.
   */
  const [showLink, setShowLink] = useState(false);

  // Bumped by Resend so the link panel refetches. It also tells the panel to
  // say "New link ready" rather than repeating the first-time instruction.
  const [linkVersion, setLinkVersion] = useState(0);

  const isDisabled = user.status === "disabled";
  const fullName = `${user.first_name} ${user.last_name}`;

  return (
    <DetailPanel
      label={fullName}
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
          <EditUserDialog user={user} membership={membership} />

          {user.status === "invited" && (
            <>
              {/*
                SHOW AND RESEND ARE DIFFERENT VERBS (C56). Show reveals the
                SAME link as often as you like -- the common case, because
                there is no email and the admin sends it by hand. Resend mints
                a new token and kills the old one, so it is for "that went to
                the wrong person" and nothing else.

                NEITHER LABEL CHANGES INTO A DEAD BUTTON. "New link ready" used
                to replace Resend and stay disabled, which read as a broken
                control and wrapped onto two lines in a 360px panel. The
                acknowledgement belongs with the link it describes, so that is
                where it went.
              */}
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setShowLink((shown) => !shown)}
                aria-expanded={showLink}
              >
                {showLink ? "Hide link" : "Show link"}
              </button>

              <button
                type="button"
                className={styles.secondaryAction}
                disabled={resendPending}
                onClick={() => {
                  /*
                   * Reveal the new link rather than hiding the old one. The
                   * token has changed, so showing the replacement IS the
                   * acknowledgement -- and `linkVersion` is what makes the
                   * panel refetch instead of displaying a link that stopped
                   * working the instant this was pressed.
                   */
                  resend(user.id, {
                    onSuccess: () => {
                      setLinkVersion((version) => version + 1);
                      setShowLink(true);
                    },
                  });
                }}
              >
                {resendPending ? "Working…" : "Resend"}
              </button>
            </>
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
                {user.role === "owner" ? (
                  /*
                   * An organisation with no owner has nobody who can appoint
                   * one (C14), so neither switching them off nor removing them
                   * is offered — and the reason is given rather than leaving
                   * an inert menu.
                   */
                  <p className={styles.menuNote}>
                    The owner cannot be deactivated or removed. Transfer ownership first.
                  </p>
                ) : (
                  <>
                    <DropdownMenu.Separator className={styles.menuSeparator} />

                    {/*
                      `onSelect` prevented: the menu must stay long enough to
                      open the confirmation, and Radix closes it on select by
                      default — taking the dialog's trigger with it.
                    */}
                    <DropdownMenu.Item
                      className={styles.menuItemPlain}
                      onSelect={(event) => {
                        event.preventDefault();
                      }}
                      asChild
                    >
                      <div>
                        <RemoveUserDialog
                          user={user}
                          orgName={membership.org_name}
                          onRemoved={onClose}
                        />
                      </div>
                    </DropdownMenu.Item>
                  </>
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

      {showLink && user.status === "invited" && (
        /*
          NO `key` HERE, and that is not an oversight. `UsersScreen` already
          keys this whole panel by person, so selecting a different row
          remounts everything inside it -- `showLink` resets to false and the
          link is refetched when asked for again.

          A second key was written here first, on the reasoning that showing
          one person's link under another person's name is the worst version of
          this bug because it WORKS. Reverting it proved the test still passed:
          the outer key was already doing the job, which makes a key here a
          check that cannot fail. The guard is one level up and has its own
          test; this comment is what keeps the next person from assuming
          otherwise.
        */
        <InviteLinkPanel
          userId={user.id}
          email={user.email}
          version={linkVersion}
          isFresh={resent}
        />
      )}

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
          {user.apps.length === 0 && user.administers === null ? (
            <span className={styles.note}>No apps yet. They cannot open anything.</span>
          ) : (
            <ul className={styles.appList}>
              {user.apps.map((entry) => (
                <li key={entry.app} className={styles.appEntry}>
                  <span className={styles.appName}>{appName(entry.app)}</span>
                  <span className={styles.appRole}>{entry.role_name}</span>
                </li>
              ))}
              {/*
                Administration last, and not from `apps` — it is never granted
                as an app (C53). An org admin with no products holds nothing in
                `apps` and still administers, which is why the empty case above
                checks both.
              */}
              {user.administers !== null && (
                <li key="admin" className={styles.appEntry}>
                  <span className={styles.appName}>Administration</span>
                  <span className={styles.appRole}>
                    {administersLabel(user.administers)}
                  </span>
                </li>
              )}
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
