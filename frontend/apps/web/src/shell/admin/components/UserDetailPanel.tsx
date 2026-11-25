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

import { useState, type ReactNode } from "react";
import { asProblem } from "@xpredict/api-client";
import { DetailPanel } from "@xpredict/ui";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  MailIcon,
  MapPinIcon,
  ShieldIcon,
  UserRoundIcon,
} from "lucide-react";

import type { Membership } from "../../api/auth";
import { useAccess } from "../../access";
import { APP_CATALOG } from "../../navigation";
import { adminRoleLabel } from "../administers";
import type { OrgUser, UserAppRole } from "../api/users";
import { useResendInvitation, useSetAppStatus, useUnassignApp } from "../hooks/useUsers";
import { AssignAppsDialog } from "./AssignAppsDialog";
import { ConfirmAppDialog } from "./ConfirmAppDialog";
import { EditAppDialog } from "./EditAppDialog";
import { InviteLinkPanel } from "./InviteLinkPanel";
import { recordPanelStyles as panel } from "@xpredict/ui";
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

/**
 * Info, Zoho's way: a "Basic Information" section that folds away, one row
 * per fact -- an icon, a small label, the value. The same look as the
 * Organization Profile's facts, so the Admin panel reads as one thing.
 */
function InfoTab({ user }: { user: OrgUser }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionHeading}>
          <button
            type="button"
            className={styles.sectionToggle}
            aria-expanded={open}
            aria-controls="user-basic-info"
            onClick={() => setOpen((shown) => !shown)}
          >
            <ChevronDownIcon size={16} aria-hidden="true" className={styles.chevron} />
            Basic Information
          </button>
        </h3>

        {open && (
          <dl id="user-basic-info" className={styles.facts}>
            <Fact icon={<CircleCheckIcon size={18} />} label="Status">
              <span className={styles.status} data-status={user.status}>
                {user.status === "active"
                  ? "Active"
                  : user.status === "invited"
                    ? "Invitation sent"
                    : "Inactive"}
              </span>
            </Fact>

            {/* Their Admin panel role; an app's own roles are on Applications. */}
            <Fact icon={<ShieldIcon size={18} />} label="Role">
              <span className={styles.role}>{adminRoleLabel(user) ?? "User"}</span>
            </Fact>

            <Fact icon={<UserRoundIcon size={18} />} label="First name">
              <Value text={user.first_name} />
            </Fact>

            <Fact icon={<UserRoundIcon size={18} />} label="Last name">
              <Value text={user.last_name} />
            </Fact>

            <Fact icon={<MailIcon size={18} />} label="Email">
              <Value text={user.email} />
            </Fact>

            {/* Only for somebody confined to one dealer: everybody else sees the
                whole organisation, and a row saying so for everyone is noise. */}
            {user.unit_name && (
              <Fact icon={<MapPinIcon size={18} />} label="Dealer">
                <Value text={user.unit_name} />
                <span className={styles.note}>Their DMS records are limited to this dealer.</span>
              </Fact>
            )}
          </dl>
        )}
      </section>

      {user.status === "invited" && <Invitation user={user} />}
    </>
  );
}

interface FactProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

/**
 * One row: the icon, then the label over the value. The icon sits INSIDE the
 * <dt> and is placed by CSS, because a <dl> row may hold only <dt> and <dd>.
 */
function Fact({ icon, label, children }: FactProps) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>
        <span className={styles.factIcon} aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  );
}

/** A value, or a dash when there is none (a last name is optional). */
function Value({ text }: { text: string | null | undefined }) {
  return text ? <span>{text}</span> : <span className={styles.unset}>—</span>;
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
 *
 * EACH ON ITS ENDPOINT'S PERMISSION (the 2026-11-23 audit): Show link is
 * `admin.user.create` -- handing out a way in is part of adding somebody --
 * and Resend `admin.user.resend_invitation`. Greyed without them; they used
 * to be live for anybody who could see a pending person, and 403.
 */
function Invitation({ user }: { user: OrgUser }) {
  const access = useAccess();
  const canShow = access.can("admin.user.create");
  const canResend = access.can("admin.user.resend_invitation");
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
          aria-disabled={canShow ? undefined : "true"}
          title={canShow ? undefined : "You cannot hand out invitation links"}
          onClick={() => {
            if (canShow) setShowLink((shown) => !shown);
          }}
          aria-expanded={showLink}
        >
          {showLink ? "Hide link" : "Show link"}
        </button>

        <button
          type="button"
          className={styles.secondaryAction}
          disabled={resendPending}
          aria-disabled={canResend ? undefined : "true"}
          title={canResend ? undefined : "You cannot resend invitations"}
          onClick={() => {
            if (!canResend) return;
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
 * THE "+" ASSIGNS APPLICATIONS (C83): it opens the two-step dialog, for
 * whoever holds `admin.user.assign_app`. Not on the owner's panel -- they hold
 * every app by rule -- and not shown without the permission.
 *
 * EACH PRODUCT TILE'S Edit | Disable | Unassign WORK (the owner, 2026-11-20):
 * `TileActions`. The owner's tiles and the Admin panel tile keep them greyed.
 */
function ApplicationsTab({ user }: { user: OrgUser }) {
  const name = displayName(user);
  const access = useAccess();
  const canAssign = user.role !== "owner" && access.can("admin.user.assign_app");
  const [assigning, setAssigning] = useState(false);
  // A refusal from any tile's action, shown above the tiles.
  const [problem, setProblem] = useState<string | null>(null);
  const isOwner = user.role === "owner";

  const empty = user.apps.length === 0 && user.administers === null;

  return (
    <>
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.apps}>
        {canAssign && (
          <>
            <button
              type="button"
              className={styles.addApp}
              aria-label={`Assign applications to ${name}`}
              title="Assign applications"
              onClick={() => setAssigning(true)}
            >
              <PlusIcon />
            </button>
            <AssignAppsDialog user={user} open={assigning} onOpenChange={setAssigning} />
          </>
        )}
        <span className={styles.rule} aria-hidden="true" />

        {empty ? (
          <p className={styles.note}>No apps yet. They cannot open anything.</p>
        ) : (
          <ul className={styles.appList} aria-label={`${name}'s applications`}>
            {user.apps.map((grant) => (
              <AppTile
                key={grant.app}
                name={appName(grant.app)}
                initials={appInitials(grant.app)}
                role={grant.role_name}
                disabled={grant.status === "disabled"}
              >
                {/*
                  THE OWNER HOLDS EVERY APP BY RULE: there is nothing of theirs
                  to edit, disable or take away, so their tiles stay greyed.
                */}
                {isOwner ? (
                  <LaterActions appName={appName(grant.app)} personName={name} />
                ) : (
                  <TileActions user={user} grant={grant} onProblem={setProblem} />
                )}
              </AppTile>
            ))}
            {/*
              The Admin panel last, and not from `apps` -- it is never granted
              as an app (C53). Its actions stay greyed: making or unmaking an
              admin is Assign Admin's job, not this tile's.
            */}
            {user.administers !== null && (
              <AppTile
                name="Admin panel"
                initials={appInitials("admin")}
                role={adminRoleLabel(user)}
                disabled={false}
              >
                <LaterActions appName="Admin panel" personName={name} />
              </AppTile>
            )}
          </ul>
        )}
      </div>
    </>
  );
}

interface AppTileProps {
  name: string;
  initials: string;
  role: string | null;
  disabled: boolean;
  children: ReactNode;
}

/** One app: its badge, name (and Disabled, if so), their role, and the actions. */
function AppTile({ name, initials, role, disabled, children }: AppTileProps) {
  return (
    <li className={styles.appTile} data-disabled={disabled ? "" : undefined}>
      <span className={styles.appBadge} aria-hidden="true">
        {initials}
      </span>
      <div className={styles.appText}>
        <span className={styles.appNameRow}>
          <span className={styles.appName}>{name}</span>
          {disabled && <span className={styles.disabledTag}>Disabled</span>}
        </span>
        {role && (
          <span className={styles.appRole} title={role}>
            {role}
          </span>
        )}
        <div className={panel.memberActions}>{children}</div>
      </div>
    </li>
  );
}

/** Edit | Disable | Unassign drawn only, greyed: the owner's tiles and the Admin panel's. */
function LaterActions({ appName, personName }: { appName: string; personName: string }) {
  return (
    <>
      {(["Edit", "Disable", "Unassign"] as const).map((action) => (
        <button
          key={action}
          type="button"
          className={panel.memberAction}
          aria-disabled="true"
          aria-label={`${action} ${appName} for ${personName}`}
          title="Not available here"
        >
          {action}
        </button>
      ))}
    </>
  );
}

interface TileActionsProps {
  user: OrgUser;
  grant: UserAppRole;
  onProblem: (message: string | null) => void;
}

/**
 * The app tile's Edit | Disable | Unassign (the owner, 2026-11-20, as Zoho's).
 *
 * EACH ON ITS OWN PERMISSION -- `admin.user.edit_app`, `.disable_app`,
 * `.unassign_app` -- and greyed without it. Disable and Unassign ask first
 * (`ConfirmAppDialog`, which shows its own refusals); Disable becomes Enable
 * on a disabled app, which needs no question -- a refusal from Enable shows
 * above the tiles. A pending person's apps open nothing yet, so there is
 * nothing to disable: that button stays greyed.
 */
function TileActions({ user, grant, onProblem }: TileActionsProps) {
  const access = useAccess();
  const name = displayName(user);
  const label = appName(grant.app);
  const isPending = user.status === "invited";
  const isDisabled = grant.status === "disabled";

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<"disable" | "unassign" | null>(null);
  const { mutateAsync: setStatus } = useSetAppStatus();
  const { mutateAsync: unassign } = useUnassignApp();

  // The role in this app -- not `admin.user.update`, which is Edit user.
  const canEdit = access.can("admin.user.edit_app");
  const canToggle = access.can("admin.user.disable_app") && !isPending;
  const canUnassign = access.can("admin.user.unassign_app");

  async function run(action: () => Promise<unknown>) {
    onProblem(null);
    try {
      await action();
    } catch (failure) {
      onProblem(asProblem(failure).detail);
    }
  }

  return (
    <>
      <TileButton
        label="Edit"
        target={`${label} for ${name}`}
        allowed={canEdit}
        onPress={() => setEditing(true)}
      />
      <TileButton
        label={isDisabled ? "Enable" : "Disable"}
        target={`${label} for ${name}`}
        allowed={canToggle}
        why={isPending ? "Not until they join" : undefined}
        onPress={() =>
          isDisabled
            ? // Enabling gives back what they had: nothing to confirm.
              void run(() => setStatus({ userId: user.id, app: grant.app, action: "enable" }))
            : setConfirming("disable")
        }
      />
      <TileButton
        label="Unassign"
        target={`${label} for ${name}`}
        allowed={canUnassign}
        onPress={() => setConfirming("unassign")}
      />

      {canEdit && (
        <EditAppDialog user={user} grant={grant} open={editing} onOpenChange={setEditing} />
      )}
      <ConfirmAppDialog
        open={confirming === "disable"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Disable ${label} for ${name}`}
        question="Are you sure you want to disable the application for this user?"
        verb="Disable"
        onConfirm={() => setStatus({ userId: user.id, app: grant.app, action: "disable" })}
      />
      <ConfirmAppDialog
        open={confirming === "unassign"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Unassign ${label} for ${name}`}
        question="Are you sure you want to unassign the application?"
        verb="Unassign"
        onConfirm={() => unassign({ userId: user.id, app: grant.app })}
      />
    </>
  );
}

interface TileButtonProps {
  label: string;
  /** "DMS for Ravi S" -- so a screen reader hears which app and whose. */
  target: string;
  allowed: boolean;
  /** Why it is greyed, when the reason is not a missing permission. */
  why?: string;
  onPress: () => void;
}

/**
 * Live, or greyed with `aria-disabled` -- not `disabled` -- so a keyboard still
 * reaches it and its reason can be read.
 */
function TileButton({ label, target, allowed, why, onPress }: TileButtonProps) {
  return (
    <button
      type="button"
      className={`${panel.memberAction} ${allowed ? styles.liveAction : ""}`}
      aria-disabled={allowed ? undefined : "true"}
      aria-label={`${label} ${target}`}
      title={allowed ? undefined : (why ?? "You do not have permission")}
      onClick={allowed ? onPress : undefined}
    >
      {label}
    </button>
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
