/**
 * One person, opened beside the Users list — in the same shape as an app's
 * panel (C78, `RecordPanel.module.css`): a header with their initials, name,
 * email and ⋮, then tabs that stay put while the tab's content scrolls.
 *
 * FOUR TABS, the Zoho set. "Info" (status, standing, scope, and the invitation
 * while they have not joined) and "Applications" (what they hold in each app)
 * work; "Groups" and "Account Activity" are planned and greyed out, with
 * `aria-disabled` rather than `disabled` so a keyboard still reaches them.
 *
 * The ⋮ is `UserActions`, the same one their row in the list carries.
 *
 * The chrome — beside the list or over it, Escape, focus — is `DetailPanel`
 * in packages/ui, shared with Dealers and Applications. Only the content is
 * here.
 */

import { useState } from "react";
import { DetailPanel } from "@xpredict/ui";

import type { Membership } from "../../api/auth";
import { APP_CATALOG } from "../../navigation";
import { administersLabel } from "../administers";
import type { OrgUser } from "../api/users";
import { useResendInvitation } from "../hooks/useUsers";
import { InviteLinkPanel } from "./InviteLinkPanel";
import panel from "./RecordPanel.module.css";
import { UserActions, displayName } from "./UserActions";
import styles from "./UserDetailPanel.module.css";
import { initials } from "./UserTable";

interface UserDetailPanelProps {
  user: OrgUser;
  /** The signed-in person's membership — what they may change depends on it. */
  membership: Membership;
  onClose: () => void;
}

type Tab = "info" | "apps";

const LATER_TABS = ["Groups", "Account Activity"];

export function UserDetailPanel({ user, membership, onClose }: UserDetailPanelProps) {
  const [tab, setTab] = useState<Tab>("info");
  const [statusError, setStatusError] = useState<string | null>(null);
  const name = displayName(user);

  return (
    <DetailPanel
      label={name}
      onClose={onClose}
      header={
        <>
          <span className={panel.badge} aria-hidden="true">
            {initials(user)}
          </span>
          <div className={panel.heading}>
            <h2 className={panel.name}>{name}</h2>
            <p className={panel.description}>{user.email}</p>
          </div>
          <UserActions
            user={user}
            membership={membership}
            onRemoved={onClose}
            onStatusError={setStatusError}
          />
        </>
      }
    >
      <div className={panel.tabs} role="tablist" aria-label={`${name} details`}>
        <TabButton id="info" label="Info" current={tab} onSelect={setTab} />
        <TabButton id="apps" label="Applications" current={tab} onSelect={setTab} />
        {LATER_TABS.map((label) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected="false"
            aria-disabled="true"
            title="Coming later"
            className={panel.tab}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`user-panel-${tab}`}
        aria-labelledby={`user-tab-${tab}`}
        className={panel.panel}
      >
        {/* THE ONLY PART THAT SCROLLS: header and tabs stay where they are. */}
        <div className={panel.scroll}>
          {statusError && (
            <p className={styles.error} role="alert">
              {statusError}
            </p>
          )}
          {tab === "info" ? <InfoTab user={user} /> : <ApplicationsTab user={user} />}
        </div>
      </div>
    </DetailPanel>
  );
}

interface TabButtonProps {
  id: Tab;
  label: string;
  current: Tab;
  onSelect: (tab: Tab) => void;
}

function TabButton({ id, label, current, onSelect }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      id={`user-tab-${id}`}
      aria-selected={current === id}
      aria-controls={`user-panel-${id}`}
      className={panel.tab}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );
}

function InfoTab({ user }: { user: OrgUser }) {
  return (
    <>
      <dl className={styles.facts}>
        <dt>Status</dt>
        <dd>
          <span className={styles.status} data-status={user.status}>
            {user.status === "active"
              ? "Active"
              : user.status === "invited"
                ? "Invitation sent"
                : "Inactive"}
          </span>
        </dd>

        <dt>Standing</dt>
        <dd>
          <span className={styles.role}>
            {user.role === "owner" ? "Owner" : user.role === "admin" ? "Admin" : "Member"}
          </span>
        </dd>

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
      </dl>

      {user.status === "invited" && <Invitation user={user} />}
    </>
  );
}

/**
 * The invitation, while they have not joined.
 *
 * SHOW AND RESEND ARE DIFFERENT VERBS (C56). Show reveals the SAME link as
 * often as you like — the common case, because there is no email and the
 * admin sends it by hand. Resend mints a new token and kills the old one, so
 * it is for "that went to the wrong person" and nothing else.
 *
 * The link is not shown until an admin asks for it: it carries the token that
 * joins the organisation as this person, so it is fetched on a press rather
 * than sitting in the panel for everybody who clicks a row.
 */
function Invitation({ user }: { user: OrgUser }) {
  const { mutate: resend, isPending: resendPending, isSuccess: resent } = useResendInvitation();
  const [showLink, setShowLink] = useState(false);
  // Bumped by Resend so the link panel refetches, and says "New link ready".
  const [linkVersion, setLinkVersion] = useState(0);

  return (
    <section className={styles.invitation} aria-label="Invitation">
      <p className={styles.note}>They have not joined yet. Send them their link to join.</p>

      <div className={styles.invitationActions}>
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
             * Reveal the new link rather than hiding the old one: the token has
             * changed, so showing the replacement IS the acknowledgement, and
             * `linkVersion` makes the panel refetch instead of displaying a
             * link that stopped working the instant this was pressed.
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
      </div>

      {showLink && (
        /*
          No `key` here: `UsersScreen` keys this whole panel by person, so
          selecting a different row remounts everything inside it — `showLink`
          resets and the link is refetched when asked for again. That guard is
          one level up and has its own test.
        */
        <InviteLinkPanel
          userId={user.id}
          email={user.email}
          version={linkVersion}
          isFresh={resent}
        />
      )}
    </section>
  );
}

/**
 * The Applications tab, Zoho's way: a "+" to give them another app, a dashed
 * rule, then a tile per app — its badge, name, their role in it, and
 * Edit | Disable | Unassign underneath.
 *
 * DRAWN ONLY (the owner, 2026-11-18): the "+" and the three actions are
 * greyed out with no behaviour yet, like the same three on an app's members.
 */
function ApplicationsTab({ user }: { user: OrgUser }) {
  const name = displayName(user);
  const tiles = [
    ...user.apps.map((entry) => ({
      key: entry.app,
      name: appName(entry.app),
      initials: appInitials(entry.app),
      role: entry.role_name,
    })),
    /*
      The Admin panel last, and not from `apps` — it is never granted as an
      app (C53). An org admin with no products holds nothing in `apps` and
      still administers, which is why the empty case below checks both.
    */
    ...(user.administers !== null
      ? [
          {
            key: "admin",
            name: "Admin panel",
            initials: appInitials("admin"),
            role: administersLabel(user.administers),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.apps}>
      <button
        type="button"
        className={styles.addApp}
        aria-disabled="true"
        aria-label={`Give ${name} another application`}
        title="Coming later"
      >
        <PlusIcon />
      </button>
      <span className={styles.rule} aria-hidden="true" />

      {tiles.length === 0 ? (
        <p className={styles.note}>No apps yet. They cannot open anything.</p>
      ) : (
        <ul className={styles.appList} aria-label={`${name}'s applications`}>
          {tiles.map((tile) => (
            <li key={tile.key} className={styles.appTile}>
              <span className={styles.appBadge} aria-hidden="true">
                {tile.initials}
              </span>
              <div className={styles.appText}>
                <span className={styles.appName}>{tile.name}</span>
                {tile.role && (
                  <span className={styles.appRole} title={tile.role}>
                    {tile.role}
                  </span>
                )}
                <div className={panel.memberActions}>
                  {(["Edit", "Disable", "Unassign"] as const).map((action) => (
                    <button
                      key={action}
                      type="button"
                      className={panel.memberAction}
                      aria-disabled="true"
                      aria-label={`${action} ${tile.name} for ${name}`}
                      title="Coming later"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The app's display name, falling back to whatever the server called it. */
function appName(key: string): string {
  return APP_CATALOG.find((app) => app.key === key)?.name ?? key;
}

/** The app's two letters from the catalogue — "DM", "CR" — as on its own panel. */
function appInitials(key: string): string {
  return APP_CATALOG.find((app) => app.key === key)?.initials ?? key.slice(0, 2).toUpperCase();
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
