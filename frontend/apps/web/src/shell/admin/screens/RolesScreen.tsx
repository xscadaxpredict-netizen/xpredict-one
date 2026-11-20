/**
 * Admin panel → Admins and Roles → the ROLES TAB (C78). The page around it —
 * title, tabs — is `AdminsAndRolesScreen`.
 *
 * THE ADMIN PANEL'S ROLES ONLY (the owner, 2026-11-18): Organization Owner and
 * Organization Admin, in the same list format as every other Admin panel page
 * (`ListPage.module.css`). App roles — DMS's Manager, Technician… — are not
 * here: they belong to each app's own settings (C78), which are not built yet.
 * The invite and edit forms still offer them, from `useRoles()`.
 *
 *   Filter     All roles (default), Built-in roles, Custom roles -- the
 *              organisation's own, made in New Role (C72 piece 5).
 *   Add Role   opens New Role, for whoever holds `admin.role.create`.
 *   Table      Role Name (with its summary under it), Users (everyone holding
 *              it: active, deactivated and pending) and Modified By ("—" for a
 *              built-in role, which nobody modifies).
 *
 * The topbar's box searches it ("Search roles") BY ROLE NAME ONLY.
 */

import { asProblem } from "@xpredict/api-client";
import { ErrorState, TableSkeleton } from "@xpredict/ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAccess } from "../../access";
import { useShellContext } from "../../context";
import { usePageSearch } from "../../../stores/pageSearchStore";
import type { PanelRole } from "../api/roles";
import { ListFilter } from "../components/ListFilter";
import { RoleDetailPanel, RoleRowActions } from "../components/RoleDetailPanel";
import { usePanelRoles } from "../hooks/useRoles";
import styles from "./ListPage.module.css";

type RoleFilter = "all" | "built_in" | "custom";

const ROLE_FILTERS = [
  { value: "all", label: "All roles" },
  { value: "built_in", label: "Built-in roles" },
  { value: "custom", label: "Custom roles" },
] as const;

const FILTER_WORD: Record<RoleFilter, string> = {
  all: "",
  built_in: "built-in ",
  custom: "custom ",
};

/** "Organization Owner" → "OO": the first letter of each of the first two words. */
export function roleInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path
        d="M7 2.5v9M2.5 7h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RolesTab({ roleCode }: { roleCode?: string }) {
  const access = useAccess();
  const { membership } = useShellContext();
  const navigate = useNavigate();
  const basePath = `/${membership.org_slug}/admin/admins-and-roles/roles`;
  const { data: roles, isPending, isError, error, refetch } = usePanelRoles();
  const selected = roleCode ? roles?.find((role) => role.code === roleCode) : undefined;
  const query = usePageSearch((state) => state.query);
  const [filter, setFilter] = useState<RoleFilter>("all");

  const needle = query.trim().toLowerCase();
  const shown = roles
    ?.filter((role) => filter === "all" || role.built_in === (filter === "built_in"))
    .filter((role) => needle === "" || role.name.toLowerCase().includes(needle));

  return (
    <>
      <div className={styles.toolbar}>
        <ListFilter id="roles-filter" value={filter} options={ROLE_FILTERS} onChange={setFilter} />
        {shown && (
          <span className={styles.count} aria-live="polite">
            {shown.length === 1 ? "1 role" : `${String(shown.length)} roles`}
          </span>
        )}
        <span className={styles.spacer} />
        {/*
          New Role (C72 piece 5), for whoever may build roles. Without the
          permission it stays greyed: `aria-disabled` rather than `disabled`,
          so a keyboard still reaches it and the reason can be read.
        */}
        {access.can("admin.role.create") ? (
          <Link
            to={`/${membership.org_slug}/admin/admins-and-roles/roles/new`}
            className={styles.primaryButton}
          >
            <PlusIcon />
            Add Role
          </Link>
        ) : (
          <button
            type="button"
            className={styles.primaryButton}
            aria-disabled="true"
            title="You do not have permission to build roles"
          >
            <PlusIcon />
            Add Role
          </button>
        )}
      </div>

      <div
        className={styles.split}
        role="tabpanel"
        aria-label="Roles"
        data-detail={selected ? "" : undefined}
      >
        <div className={styles.listArea}>
          {isPending && <TableSkeleton label="roles" columns={[360, 120, 160]} rows={2} />}

          {isError && (
            <ErrorState
              title="Could not load roles"
              code={asProblem(error).code}
              traceId={asProblem(error).trace_id}
              onRetry={() => void refetch()}
            />
          )}

          {shown && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Role Name</th>
                    <th scope="col" className={styles.number}>
                      Users
                    </th>
                    <th scope="col">Modified By</th>
                    <th scope="col" className={styles.actions}>
                      <span className={styles.visuallyHidden}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((role) => (
                    <RoleRow
                      key={role.code}
                      role={role}
                      href={`${basePath}/${role.code}`}
                      isOpen={role.code === selected?.code}
                      onOpen={() => void navigate(`${basePath}/${role.code}`)}
                    />
                  ))}
                </tbody>
              </table>

              {shown.length === 0 && (
                <p className={styles.empty}>
                  {needle
                    ? `No ${FILTER_WORD[filter]}roles match “${query.trim()}”.`
                    : filter === "custom"
                      ? "No custom roles yet."
                      : `No ${FILTER_WORD[filter]}roles.`}
                </p>
              )}
            </div>
          )}

          {/* A link to a role that is not there: a stale link, or another organisation's. */}
          {roleCode && roles && !selected && (
            <p className={styles.missing} role="status">
              That role is not in {membership.org_name}.{" "}
              <Link to={basePath} className={styles.linkButton}>
                Back to all roles
              </Link>
            </p>
          )}
        </div>

        {selected && (
          <div className={styles.panelSlot}>
            {/* `key`: a new panel per role, so one role's tab does not carry over. */}
            <RoleDetailPanel
              key={selected.code}
              role={selected}
              onClose={() => void navigate(basePath)}
            />
          </div>
        )}
      </div>
    </>
  );
}

interface RoleRowProps {
  role: PanelRole;
  href: string;
  isOpen: boolean;
  onOpen: () => void;
}

/**
 * One role. The whole row opens it beside the list; the name is also a real
 * link, so a keyboard reaches it. A custom role has a ⋮ (drawn only).
 */
function RoleRow({ role, href, isOpen, onOpen }: RoleRowProps) {
  return (
    <tr className={styles.row} data-open={isOpen || undefined} onClick={onOpen}>
      <th scope="row">
        <div className={styles.entity}>
          <span className={styles.badge} aria-hidden="true">
            {roleInitials(role.name)}
          </span>
          <div className={styles.stack}>
            <Link
              to={href}
              className={styles.primary}
              aria-current={isOpen ? "page" : undefined}
              onClick={(event) => event.stopPropagation()}
            >
              {role.name}
            </Link>
            <span className={styles.sub}>{role.summary}</span>
          </div>
        </div>
      </th>
      <td className={styles.number}>{role.users}</td>
      <td>{role.modified_by ?? <span className={styles.none}>—</span>}</td>
      {/* Stops clicks from the ⋮ menu (a portal) reaching the row. */}
      <td className={styles.actions} onClick={(event) => event.stopPropagation()}>
        <RoleRowActions role={role} />
      </td>
    </tr>
  );
}
