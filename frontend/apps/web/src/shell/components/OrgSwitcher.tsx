/**
 * Which organisation am I in, and how do I get to another.
 *
 * A DRAWER at the right edge (`TopbarDrawer`), like every other panel the
 * topbar opens, not a menu. A menu is right for a short list of commands; this
 * is a list of things each carrying a name, an identifier you can copy, and a
 * standing — and those do not fit on a menu row.
 *
 * WITH ONE MEMBERSHIP THIS IS PLAIN TEXT, not a drawer with a single row in it.
 * C13 decided against an organisation picker screen on the grounds that a
 * choice with one option is not a choice; the same reasoning applies here.
 *
 * SWITCHING IS A NAVIGATION, NOT A SETTING. The organisation lives in the URL
 * (`/:orgSlug/...`), so changing org means going to a different address. It is
 * deliberately not stored anywhere: a "current org" kept in a store would
 * disagree with the URL the moment someone used the back button or a bookmark,
 * and the loser of that disagreement would be showing the wrong customer's data.
 */

import { SettingsIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Membership } from "../api/auth";
import { visibleApps } from "../navigation";
import { DrawerClose, DrawerTitle, TopbarDrawer } from "./TopbarDrawer";
import styles from "./OrgSwitcher.module.css";

interface OrgSwitcherProps {
  memberships: Membership[];
  currentOrgSlug: string;
  /**
   * The app to stay in when switching, so the user does not lose their place.
   *
   * Undefined means they are on the launcher — and switching then lands on the
   * other organisation's launcher, which is right: the app they were in may
   * not even exist over there.
   */
  currentAppKey: string | undefined;
}

export function OrgSwitcher({ memberships, currentOrgSlug, currentAppKey }: OrgSwitcherProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const current = memberships.find((m) => m.org_slug === currentOrgSlug);
  const label = current?.org_name ?? currentOrgSlug;

  if (memberships.length < 2) {
    return (
      <div className={styles.static}>
        <span className={styles.orgName}>{label}</span>
        {current?.unit_name && <span className={styles.unit}>{current.unit_name}</span>}
      </div>
    );
  }

  /*
   * "Manage" only appears for someone who can actually open Administration.
   * Same entitlement rule as everything else — `visibleApps` — rather than a
   * second check on `role` that would drift from it.
   */
  const canManage = current
    ? visibleApps(current).some((app) => app.definition.key === "admin" && app.enabled)
    : false;

  function go(path: string) {
    setOpen(false);
    void navigate(path);
  }

  async function copyOrgId(orgId: string) {
    try {
      await navigator.clipboard.writeText(orgId);
      setCopiedId(orgId);
      // Reverts on its own. A "Copied" that stays forever stops meaning
      // anything the second time somebody presses it.
      setTimeout(() => setCopiedId((was) => (was === orgId ? null : was)), 1500);
    } catch {
      /*
       * The clipboard API needs a secure context and permission, and refuses
       * in some browsers. Silently doing nothing is wrong, so the ID stays on
       * screen and selectable, and nothing claims it was copied.
       */
      setCopiedId(null);
    }
  }

  return (
    <TopbarDrawer
      open={open}
      onOpenChange={setOpen}
      triggerLabel={`Switch organisation, current: ${label}${current?.unit_name ? `, ${current.unit_name}` : ""}`}
      // The name in full: the button cuts a long one short with an ellipsis.
      tooltip={label}
      triggerClassName={styles.trigger}
      triggerContent={
        <>
          <span className={styles.orgName}>{label}</span>
          {/* The unit shows here as well as in the single-org case. In DMS it
              is which dealer you are acting as, so dropping it for multi-org
              users would hide the more important half of "where am I". */}
          {current?.unit_name && <span className={styles.unit}>{current.unit_name}</span>}
          <ChevronIcon />
        </>
      }
    >
      <div className={styles.header}>
        <DrawerTitle className={styles.title}>Organisations</DrawerTitle>
        {canManage && (
          <button
            type="button"
            className={styles.manage}
            onClick={() => go(`/${currentOrgSlug}/admin`)}
          >
            <SettingsIcon size={16} aria-hidden="true" />
            Manage
          </button>
        )}
        <span className={styles.divider} aria-hidden="true" />
        <DrawerClose className={styles.close} aria-label="Close organisations">
          <XIcon size={18} aria-hidden="true" />
        </DrawerClose>
      </div>

      <h3 className={styles.sectionLabel}>My organisations</h3>

      <ul className={styles.list}>
        {memberships.map((membership) => {
          const isCurrent = membership.org_slug === currentOrgSlug;
          const standing = standingLabel(membership);
          return (
            <li key={membership.org_id} className={styles.row} data-current={isCurrent || undefined}>
              {/*
                Two separate buttons, side by side — never one inside the
                other. Copy is a different action from switch, and a button
                nested in a button gives two tab stops that disagree about
                what they do.
              */}
              <button
                type="button"
                className={styles.choose}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() =>
                  go(
                    currentAppKey
                      ? `/${membership.org_slug}/${currentAppKey}`
                      : `/${membership.org_slug}`,
                  )
                }
              >
                <span className={styles.mark} aria-hidden="true">
                  <OrgIcon />
                </span>

                <span className={styles.text}>
                  <span className={styles.name}>{membership.org_name}</span>
                  {/*
                    The ID, not the slug. This is the value support asks for,
                    and it is the one thing about an organisation that never
                    changes — a slug can be renamed, so a number quoted in an
                    old email would stop matching. Nobody retypes a UUID, which
                    is what earns the copy button beside it.
                  */}
                  <span className={styles.orgId}>
                    <span className={styles.orgIdLabel}>Organization ID:</span> {membership.org_id}
                  </span>
                  {(standing || membership.unit_name) && (
                    <span className={styles.meta}>
                      {standing && <span className={styles.standing}>{standing}</span>}
                      {membership.unit_name && <span>{membership.unit_name}</span>}
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                className={styles.copy}
                data-copied={copiedId === membership.org_id || undefined}
                onClick={() => void copyOrgId(membership.org_id)}
                aria-label={`Copy the organisation ID of ${membership.org_name}`}
                title={copiedId === membership.org_id ? "Copied" : "Copy ID"}
              >
                {copiedId === membership.org_id ? <CheckIcon /> : <CopyIcon />}
              </button>

              {isCurrent && (
                <span className={styles.check}>
                  <CheckIcon />
                  {/* The tick is the only thing marking the current
                      organisation, and a tick is not announced. */}
                  <span className={styles.srOnly}>Current organisation</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </TopbarDrawer>
  );
}

/**
 * "Owner" or "Admin" where that is true, and nothing for `member`.
 *
 * Standing alone shows a dealer administrator as "Member" (C40 — what somebody
 * may DO is in their app permissions, not here), which is the bug the owner
 * found in the user list. So a member's row carries their dealership instead,
 * and an organisation-wide member carries nothing rather than a label that
 * may be wrong.
 */
function standingLabel(membership: Membership): string | null {
  if (membership.role === "owner") return "Owner";
  if (membership.role === "admin") return "Admin";
  return null;
}

function ChevronIcon() {
  return (
    <svg
      className={styles.chevron}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 4.75 6 7.75l3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OrgIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 20.5V6a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 14 6v14.5" />
      <path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5v9" />
      <path d="M2.8 20.5h18.4" />
      <path d="M7 8.5h4M7 12h4M7 15.5h4M17 13.5h.01M17 17h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="m3.5 8.5 3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5A1.5 1.5 0 0 0 9 2H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 10" />
    </svg>
  );
}
