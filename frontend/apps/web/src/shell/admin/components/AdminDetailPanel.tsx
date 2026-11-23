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
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAccess } from "../../access";
import { useShellContext } from "../../context";
import { findApp } from "../../navigation";
import type { Admin } from "../api/admins";
import { useUnassignAdmin } from "../hooks/useAdmins";
import { usePanelRoles } from "../hooks/useRoles";
import { ConfirmAppDialog } from "./ConfirmAppDialog";
import { ManageRolesDialog } from "./ManageRolesDialog";
import panel from "./RecordPanel.module.css";
import { RowMenu } from "./RowMenu";
import { displayName } from "./UserActions";
import tiles from "./UserDetailPanel.module.css";
import { initials } from "./UserTable";

/**
 * The ⋮ for one admin: Manage Roles and Unassign (the owner, 2026-11-23).
 *
 *   Manage Roles  change their one Admin panel role (`admin.admin.assign_admin`
 *                 -- the same act as giving one -- and `admin.role.view`, since
 *                 the dialog lists the roles).
 *   Unassign      take it away, after "Are you sure?" (`unassign_admin`). They
 *                 keep every other app.
 *
 * GREYED, WITH WHY: on YOUR OWN row (it would lock you out -- the owner's
 * choice), and on somebody whose current role is more than you hold (it is not
 * `grantable` for you -- the owner's choice). THE OWNER HAS NO ⋮ at all:
 * ownership is not an admin role that can be managed or taken away (C14).
 * NONE OF THIS IS SECURITY: the server refuses each case again.
 */
export function AdminActions({ admin }: { admin: Admin }) {
  const { me, membership } = useShellContext();
  const access = useAccess();
  const navigate = useNavigate();
  const location = useLocation();
  // THE ROLES SAY WHETHER THEIR ROLE IS WITHIN YOURS (`grantable`), and only
  // somebody with `admin.role.view` may read them. Without it neither act can
  // be judged, so both stay greyed -- and no request bound to 403 is sent.
  const seesRoles = access.can("admin.role.view");
  const mayAct = access.can("admin.admin.assign_admin") || access.can("admin.admin.unassign_admin");
  const roles = usePanelRoles({ enabled: seesRoles && mayAct });
  const base = `/${membership.org_slug}/admin/admins-and-roles`;
  const { mutateAsync: unassign } = useUnassignAdmin({
    // Off their address, so their panel does not linger -- only if it is open.
    onUnassigned: () => {
      if (location.pathname.startsWith(`${base}/admin/${admin.id}`)) void navigate(base);
    },
  });
  const [opened, setOpened] = useState<"manage" | "unassign" | null>(null);

  if (admin.role === "owner") return null;

  const isSelf = admin.email.toLowerCase() === me.email.toLowerCase();
  // Their current role within what you hold? Unknown until the roles load.
  const yours = roles.data?.find((r) => r.code === admin.admin_role.code)?.grantable ?? false;
  const canManage = !isSelf && yours && seesRoles && access.can("admin.admin.assign_admin");
  const canUnassign = !isSelf && yours && seesRoles && access.can("admin.admin.unassign_admin");

  return (
    <>
      <RowMenu
        label={`More actions for ${displayName(admin)}`}
        items={[
          { label: "Manage Roles", disabled: !canManage, onSelect: () => setOpened("manage") },
          {
            label: "Unassign",
            danger: true,
            disabled: !canUnassign,
            onSelect: () => setOpened("unassign"),
          },
        ]}
        note={
          isSelf
            ? "You cannot change your own admin role. Ask another admin."
            : mayAct && !seesRoles
              ? "Managing admins needs the Roles tab's view too."
              : roles.data && !yours
                ? "Their role is more than you hold."
                : undefined
        }
      />
      <ManageRolesDialog
        admin={admin}
        open={opened === "manage"}
        onOpenChange={(open) => setOpened(open ? "manage" : null)}
      />
      <ConfirmAppDialog
        open={opened === "unassign"}
        onOpenChange={(open) => setOpened(open ? "unassign" : null)}
        title={`Unassign ${displayName(admin)}`}
        question={`Are you sure you want to unassign the admin role from ${displayName(admin)}?`}
        verb="Unassign"
        onConfirm={() => unassign(admin.id)}
      />
    </>
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
      {/*
        WHAT THEIR ROLE SAYS, NOT "EVERY APP" FOR EVERYBODY (C89, the owner's
        report): somebody holding the organisation's own "Application Admin"
        manages no app -- they do in the Admin panel only what that role allows.
      */}
      <p className={tiles.note}>
        {admin.role === "owner"
          ? `As the owner, manages every app in ${membership.org_name}.`
          : admin.role === "admin"
            ? `As an organization admin, manages every app in ${membership.org_name}.`
            : `Holds the ${admin.admin_role.name} role: manages no app, and can do in the Admin panel only what that role allows.`}
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
