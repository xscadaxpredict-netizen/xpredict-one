/**
 * One admin, opened beside the Admins tab's list (C78, the owner 2026-11-18) --
 * in the same shape as every Admin panel side panel (`RecordPanel.module.css`):
 * a header with their initials, name, email and ⋮, then tabs that stay put
 * while the content scrolls.
 *
 * TWO TABS. "Applications" works: what this admin manages -- every app the
 * organisation has, because both the owner and an organisation admin hold
 * every app (C72). "Groups" is Zoho's and greyed out: we have no groups yet.
 *
 * THE APPS COME WITH THE ROW (`apps_managed`, from `GET /admin/admins/`), not
 * from the Applications page's endpoint: that one needs
 * `admin.application.view`, and somebody allowed the Admins tab is not
 * necessarily allowed Applications (C79).
 */

import { DetailPanel } from "@xpredict/ui";

import { useShellContext } from "../../context";
import { findApp } from "../../navigation";
import type { Admin } from "../api/admins";
import panel from "./RecordPanel.module.css";
import { RowMenu } from "./RowMenu";
import { displayName } from "./UserActions";
import tiles from "./UserDetailPanel.module.css";
import { initials } from "./UserTable";

/**
 * The ⋮ for one admin: Manage Roles and Unassign (the owner, 2026-11-18).
 *
 * DRAWN ONLY: both greyed out, no behaviour yet -- their permissions exist
 * (`admin.admin.assign_admin` / `unassign_admin`, C79) and the endpoints do
 * not. THE OWNER HAS NO ⋮ at all: ownership is not an admin role that can be
 * managed or taken away (C14).
 */
export function AdminActions({ admin }: { admin: Admin }) {
  if (admin.role === "owner") return null;

  return (
    <RowMenu
      label={`More actions for ${displayName(admin)}`}
      items={[
        { label: "Manage Roles", disabled: true },
        { label: "Unassign", danger: true, disabled: true },
      ]}
      note="Coming later."
    />
  );
}

interface AdminDetailPanelProps {
  admin: Admin;
  onClose: () => void;
}

export function AdminDetailPanel({ admin, onClose }: AdminDetailPanelProps) {
  const name = displayName(admin);

  return (
    <DetailPanel
      label={name}
      onClose={onClose}
      header={
        <>
          <span className={panel.badge} aria-hidden="true">
            {initials(admin)}
          </span>
          <div className={panel.heading}>
            <h2 className={panel.name}>{name}</h2>
            <p className={panel.description}>{admin.email}</p>
          </div>
          <AdminActions admin={admin} />
        </>
      }
    >
      <div className={panel.tabs} role="tablist" aria-label={`${name} as an admin`}>
        <button
          type="button"
          role="tab"
          id="admin-tab-apps"
          aria-selected="true"
          aria-controls="admin-panel-apps"
          className={panel.tab}
        >
          Applications
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          title="Coming later"
          className={panel.tab}
        >
          Groups
        </button>
      </div>

      <div
        role="tabpanel"
        id="admin-panel-apps"
        aria-labelledby="admin-tab-apps"
        className={panel.panel}
      >
        <div className={panel.scroll}>
          <ManagedApps admin={admin} />
        </div>
      </div>
    </DetailPanel>
  );
}

function ManagedApps({ admin }: { admin: Admin }) {
  const { membership } = useShellContext();
  const active = admin.apps_managed;

  return (
    <>
      <p className={tiles.note}>
        {admin.role === "owner"
          ? `As the owner, manages every app in ${membership.org_name}.`
          : `As an organization admin, manages every app in ${membership.org_name}.`}
      </p>

      {active.length > 0 && (
        <ul className={tiles.appList} aria-label={`Apps ${displayName(admin)} manages`}>
          {active.map((app) => (
            <li key={app.code} className={tiles.appTile}>
              <span className={tiles.appBadge} aria-hidden="true">
                {findApp(app.code)?.initials ?? app.name.slice(0, 2).toUpperCase()}
              </span>
              <div className={tiles.appText}>
                <span className={tiles.appName}>{app.name}</span>
                <span className={tiles.appRole}>All</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
