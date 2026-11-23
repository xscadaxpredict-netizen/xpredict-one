/**
 * One role, opened beside the Roles tab's list (the owner, 2026-11-20, from
 * Zoho's) -- the same shape as every Admin panel side panel
 * (`RecordPanel.module.css`): a header with the role's initials, name,
 * description and ⋮, then tabs that stay put while the content scrolls.
 *
 * TWO TABS:
 *   Permissions  what the role holds, page by page: every action of the page,
 *                the held ones filled in. Read from the role builder's tree
 *                (`/admin/role-builder/`), so it is the same names as New Role.
 *   Users        who holds it: the owner for Organization Owner, the
 *                organisation admins for Organization Admin, and nobody yet for
 *                a custom role -- nothing can give one until Assign Admin.
 *
 * THE ⋮ IS A CUSTOM ROLE'S ONLY -- on the row Edit / Delete Role, in the panel
 * Assign Users / Edit / Delete Role (the owner's Zoho screens). Built-in roles
 * cannot be changed or deleted, so they have none.
 *
 *   Edit Role     New Role's page, filled in (`admin.role.update`).
 *   Delete Role   "Are you sure?", then the request while the question is open,
 *                 so the server's refusal -- somebody still holds the role, a
 *                 member or a pending person -- is shown right there
 *                 (`admin.role.delete`).
 *   Assign Users  still drawn only, greyed.
 *
 * NO CLONE ROLE: the owner does not want it (2026-11-23), though Zoho has it.
 * New Role's "Copy permissions from" already starts a role from another.
 */

import { asProblem } from "@xpredict/api-client";
import { DetailPanel } from "@xpredict/ui";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAccess } from "../../access";
import { useShellContext } from "../../context";
import type { PanelRole } from "../api/roles";
import { useAdmins } from "../hooks/useAdmins";
import { useDeletePanelRole, useRoleBuilder } from "../hooks/useRoles";
import { roleInitials } from "../screens/RolesScreen";
import { ConfirmAppDialog } from "./ConfirmAppDialog";
import panel from "./RecordPanel.module.css";
import styles from "./RoleDetailPanel.module.css";
import { RowMenu, type RowMenuItem } from "./RowMenu";
import { displayName } from "./UserActions";

/**
 * A custom role's ⋮, on its row or in its panel -- one component, so both
 * behave the same; only the order and Assign Users differ, as Zoho's do.
 */
function RoleActions({ role, place }: { role: PanelRole; place: "row" | "panel" }) {
  const access = useAccess();
  const { membership } = useShellContext();
  const navigate = useNavigate();
  const location = useLocation();
  const rolesPath = `/${membership.org_slug}/admin/admins-and-roles/roles`;
  const { mutateAsync: remove } = useDeletePanelRole({
    // Off the deleted role's address, so its panel does not linger -- but only
    // if it is the one open: deleting another from its row leaves yours be.
    onDeleted: () => {
      if (location.pathname.startsWith(`${rolesPath}/${role.code}`)) void navigate(rolesPath);
    },
  });
  const [deleting, setDeleting] = useState(false);

  if (role.built_in) return null;

  const edit: RowMenuItem = {
    label: "Edit Role",
    disabled: !access.can("admin.role.update"),
    onSelect: () => void navigate(`${rolesPath}/${role.code}/edit`),
  };
  const del: RowMenuItem = {
    label: "Delete Role",
    danger: true,
    disabled: !access.can("admin.role.delete"),
    onSelect: () => setDeleting(true),
  };
  const items = place === "row" ? [edit, del] : [{ label: "Assign Users", disabled: true }, edit, del];

  return (
    <>
      <RowMenu
        label={`More actions for ${role.name}`}
        items={items}
        note={place === "panel" ? "Assign Users is coming later." : undefined}
      />
      <ConfirmAppDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${role.name}`}
        question="Are you sure you want to delete this role?"
        verb="Delete"
        onConfirm={() => remove(role.code)}
      />
    </>
  );
}

/** The ⋮ on a custom role's ROW: Edit, Delete. */
export function RoleRowActions({ role }: { role: PanelRole }) {
  return <RoleActions role={role} place="row" />;
}

/** The ⋮ in a custom role's PANEL header: Assign Users as well. */
function RolePanelActions({ role }: { role: PanelRole }) {
  return <RoleActions role={role} place="panel" />;
}

type Tab = "permissions" | "users";

interface RoleDetailPanelProps {
  role: PanelRole;
  onClose: () => void;
}

export function RoleDetailPanel({ role, onClose }: RoleDetailPanelProps) {
  const [tab, setTab] = useState<Tab>("permissions");

  return (
    <DetailPanel
      label={role.name}
      onClose={onClose}
      header={
        <>
          <span className={panel.badge} aria-hidden="true">
            {roleInitials(role.name)}
          </span>
          <div className={panel.heading}>
            <h2 className={panel.name}>{role.name}</h2>
            {role.summary ? (
              <p className={panel.description}>{role.summary}</p>
            ) : (
              <button
                type="button"
                className={styles.addDescription}
                aria-disabled="true"
                title="Coming later"
              >
                Add Description
              </button>
            )}
          </div>
          <RolePanelActions role={role} />
        </>
      }
    >
      <div className={panel.tabs} role="tablist" aria-label={`${role.name} details`}>
        {(
          [
            ["permissions", "Permissions"],
            ["users", "Users"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`role-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`role-panel-${id}`}
            className={panel.tab}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`role-panel-${tab}`}
        aria-labelledby={`role-tab-${tab}`}
        className={panel.panel}
      >
        {tab === "permissions" ? <Permissions role={role} /> : <Holders role={role} />}
      </div>
    </DetailPanel>
  );
}

/**
 * What the role holds, page by page. The owner's row is a rule, not a list:
 * every permission, including ones no role can give.
 */
function Permissions({ role }: { role: PanelRole }) {
  const { data: builder, isPending, isError } = useRoleBuilder();
  const [query, setQuery] = useState("");

  if (role.code === "owner") {
    return (
      <p className={panel.note}>
        The owner holds every permission by rule, including ones no role can give.
      </p>
    );
  }
  if (isPending) return <p className={panel.note}>Loading…</p>;
  if (isError || !builder) {
    return <p className={panel.note}>Could not load this role&rsquo;s permissions.</p>;
  }

  const held = new Set(builder.templates.find((t) => t.code === role.code)?.permissions ?? []);
  const needle = query.trim().toLowerCase();

  return (
    <>
      <div className={panel.search}>
        <SearchIcon size={16} className={panel.searchIcon} aria-hidden="true" />
        <label htmlFor="role-permissions-search" className={panel.visuallyHidden}>
          Search {role.name}&rsquo;s permissions
        </label>
        <input
          id="role-permissions-search"
          type="search"
          placeholder="Search"
          className={panel.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className={panel.scroll}>
        {builder.modules.map((module) => {
          const rows = module.rows.filter(
            (row) =>
              !needle ||
              row.name.toLowerCase().includes(needle) ||
              row.actions.some((action) => action.name.toLowerCase().includes(needle)),
          );
          if (rows.length === 0) return null;
          const count = module.rows
            .flatMap((row) => row.actions)
            .filter((action) => held.has(action.permission)).length;

          return (
            <section key={module.code} aria-label={module.name} className={styles.category}>
              <h3 className={styles.categoryTitle}>
                {module.name}
                {count > 0 && (
                  <span className={styles.categoryCount} aria-label={`${String(count)} held`}>
                    {count}
                  </span>
                )}
              </h3>
              {rows.map((row) => (
                <div key={row.code} className={styles.page}>
                  <h4 className={styles.pageTitle}>{row.name}</h4>
                  <ul className={styles.chips} aria-label={`${row.name} permissions`}>
                    {row.actions.map((action) => {
                      const on = held.has(action.permission);
                      return (
                        <li
                          key={action.code}
                          className={styles.chip}
                          data-held={on || undefined}
                          aria-label={`${action.name}: ${on ? "held" : "not held"}`}
                        >
                          {action.name}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

/**
 * Who holds the role. The built-ins read the Admins tab's list; a custom role
 * cannot be given to anybody until Assign Admin exists.
 */
function Holders({ role }: { role: PanelRole }) {
  const builtIn = role.built_in;
  const { data: admins, isPending, isError, error } = useAdmins();

  if (!builtIn) {
    return (
      <p className={panel.note}>
        Nobody has this role yet. Giving a role to somebody comes with Assign Admin.
      </p>
    );
  }
  if (isPending) return <p className={panel.note}>Loading…</p>;
  if (isError) {
    return (
      <p className={panel.note}>
        {asProblem(error).status === 403
          ? "You cannot see who holds this role."
          : "Could not load who holds this role."}
      </p>
    );
  }

  const holders = (admins ?? []).filter((admin) =>
    role.code === "owner" ? admin.role === "owner" : admin.role === "admin",
  );
  if (holders.length === 0) return <p className={panel.note}>Nobody has this role.</p>;

  return (
    <div className={panel.scroll}>
      <p className={panel.count}>
        {holders.length === 1 ? "1 user" : `${String(holders.length)} users`}
      </p>
      <ul className={panel.people} aria-label={`People with ${role.name}`}>
        {holders.map((admin) => (
          <li key={admin.id} className={panel.person}>
            <span className={panel.avatar} aria-hidden="true">
              {roleInitials(displayName(admin))}
            </span>
            <div className={panel.personText}>
              <span className={panel.personName}>{displayName(admin)}</span>
              {displayName(admin) !== admin.email && (
                <span className={panel.email}>{admin.email}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
