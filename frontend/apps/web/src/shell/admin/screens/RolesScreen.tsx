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
import { Link } from "react-router-dom";

import { useAccess } from "../../access";
import { useShellContext } from "../../context";
import { usePageSearch } from "../../../stores/pageSearchStore";
import type { PanelRole } from "../api/roles";
import { ListFilter } from "../components/ListFilter";
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

export function RolesTab() {
  const access = useAccess();
  const { membership } = useShellContext();
  const { data: roles, isPending, isError, error, refetch } = usePanelRoles();
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

      <div className={styles.split} role="tabpanel" aria-label="Roles">
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
                  </tr>
                </thead>
                <tbody>
                  {shown.map((role) => (
                    <RoleRow key={role.code} role={role} />
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
        </div>
      </div>
    </>
  );
}

function RoleRow({ role }: { role: PanelRole }) {
  return (
    <tr>
      <th scope="row">
        <div className={styles.entity}>
          <span className={styles.badge} aria-hidden="true">
            {roleInitials(role.name)}
          </span>
          <div className={styles.stack}>
            <span className={styles.primary}>{role.name}</span>
            <span className={styles.sub}>{role.summary}</span>
          </div>
        </div>
      </th>
      <td className={styles.number}>{role.users}</td>
      <td>{role.modified_by ?? <span className={styles.none}>—</span>}</td>
    </tr>
  );
}
