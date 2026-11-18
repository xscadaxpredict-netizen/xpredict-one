/**
 * Admin panel → User Management → Admins and Roles (C78): ONE sub-module, as
 * Zoho has it (the owner, 2026-11-18), with three tabs.
 *
 *   Admins      who runs the organisation: its owner and its organisation
 *               admins, filtered by their Admin panel role, with what they
 *               manage. Searched by name or email.
 *   App Admins  people who run one app. Not built yet: what it lists is
 *               still to be decided.
 *   Roles       every role and what it covers (`RolesTab`).
 *
 * EACH TAB IS ITS OWN ADDRESS (`/admin/admins-and-roles`, `…/app-admins`,
 * `…/roles`), and so is an admin opened beside the list
 * (`…/admin/<membership id>`), so a refresh or a link opens the same thing, and the topbar's box
 * searches the open tab — "Search admins", "Search roles" — emptying when the
 * tab changes, the same as when the page does (`NavItem.search`).
 */

import { asProblem } from "@xpredict/api-client";
import { ErrorState, InfoHint, TableSkeleton } from "@xpredict/ui";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { usePageSearch } from "../../../stores/pageSearchStore";
import { useShellContext } from "../../context";
import type { OrgUser } from "../api/users";
import { AdminActions, AdminDetailPanel, type Admin } from "../components/AdminDetailPanel";
import { ListFilter } from "../components/ListFilter";
import { displayName } from "../components/UserActions";
import { initials } from "../components/UserTable";
import { useUsers } from "../hooks/useUsers";
import styles from "./ListPage.module.css";
import { RolesTab } from "./RolesScreen";

const TABS = [
  { id: "", label: "Admins" },
  { id: "app-admins", label: "App Admins" },
  { id: "roles", label: "Roles" },
] as const;

export function AdminsAndRolesScreen() {
  const { membership } = useShellContext();
  // `…/admin/<id>` is the Admins tab with somebody open: no `tab` segment.
  const { tab = "", personId } = useParams<{ tab: string; personId: string }>();
  const basePath = `/${membership.org_slug}/admin/admins-and-roles`;

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Admins and Roles</h1>
        <InfoHint label="About Admins and Roles">
          Who runs {membership.org_name}, and every role and what it covers. Roles are the same
          for every organisation and cannot be edited here — they are given to people on the
          Users screen.
        </InfoHint>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Admins and Roles">
        {TABS.map((item) => (
          <Link
            key={item.id}
            to={item.id ? `${basePath}/${item.id}` : basePath}
            role="tab"
            aria-selected={tab === item.id}
            className={styles.tab}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {tab === "" && <AdminsTab basePath={basePath} personId={personId} />}
      {tab === "app-admins" && (
        <p className={styles.empty} role="tabpanel" aria-label="App Admins">
          This tab is being built.
        </p>
      )}
      {tab === "roles" && (
        <div className={styles.tabBody} role="tabpanel" aria-label="Roles">
          <RolesTab />
        </div>
      )}
    </div>
  );
}

/* ---- Admins -------------------------------------------------------------- */

type AdminFilter = "all" | "owner" | "admin";

/** By Admin panel role: the owner, and the "Organisation admin" role (Q60). */
const ADMIN_FILTERS = [
  { value: "all", label: "All admins" },
  { value: "owner", label: "Organization Owner" },
  { value: "admin", label: "Organization Admin" },
] as const;

export const ROLE_LABEL: Record<"owner" | "admin", string> = {
  owner: "Organization Owner",
  admin: "Organization Admin",
};

/**
 * The organisation's admins, from the same list the Users page reads: the
 * owner and everybody whose standing is "admin" — which, since C72 step 2d,
 * is holding the "Organisation admin" role at the root.
 *
 * APPS MANAGED is "All" for both. Each holds every app by rule or by role,
 * organisation-wide; an admin of ONE app is what the App Admins tab is for.
 *
 * PICKING A ROW OPENS THE ADMIN BESIDE THE LIST, at its own address, looked up
 * in the FULL list so a search or a filter never closes what is open -- the
 * same rule as Users and Applications.
 */
function AdminsTab({ basePath, personId }: { basePath: string; personId: string | undefined }) {
  const navigate = useNavigate();
  const { data: users, isPending, isError, error, refetch } = useUsers();
  const query = usePageSearch((state) => state.query);
  const [filter, setFilter] = useState<AdminFilter>("all");

  const needle = query.trim().toLowerCase();
  const admins = users
    ?.filter((user): user is OrgUser & { role: "owner" | "admin" } => user.role !== "member")
    .filter((user) => filter === "all" || user.role === filter)
    .filter(
      (user) =>
        needle === "" ||
        `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(needle),
    );
  const filterWord = filter === "all" ? "" : `${ROLE_LABEL[filter]} `;
  const selected = personId
    ? users?.find((user): user is Admin => user.id === personId && user.role !== "member")
    : undefined;
  const openPath = (id: string) => `${basePath}/admin/${id}`;

  return (
    <>
      <div className={styles.toolbar}>
        <ListFilter
          id="admins-filter"
          value={filter}
          options={ADMIN_FILTERS}
          onChange={setFilter}
        />
        {admins && (
          <span className={styles.count} aria-live="polite">
            {admins.length === 1 ? "1 admin" : `${String(admins.length)} admins`}
          </span>
        )}
        <span className={styles.spacer} />
        {/*
          DRAWN ONLY (the owner, 2026-11-18): greyed out, no behaviour yet.
          `aria-disabled` rather than `disabled`, so a keyboard still reaches it
          and "Coming later" can be read.
        */}
        <button
          type="button"
          className={styles.primaryButton}
          aria-disabled="true"
          title="Coming later"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
            <path
              d="M7 2.5v9M2.5 7h9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Assign Admin
        </button>
      </div>

      <div
        className={styles.split}
        data-detail={selected ? "" : undefined}
        role="tabpanel"
        aria-label="Admins"
      >
        <div className={styles.listArea}>
          {isPending && <TableSkeleton label="admins" columns={[320, 200, 140]} rows={3} />}

          {isError && (
            <ErrorState
              title="Could not load admins"
              code={asProblem(error).code}
              traceId={asProblem(error).trace_id}
              onRetry={() => void refetch()}
            />
          )}

          {admins && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Admins</th>
                    <th scope="col">Roles</th>
                    <th scope="col">Apps managed</th>
                    <th scope="col" className={styles.actions}>
                      <span className={styles.visuallyHidden}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((user) => (
                    <tr
                      key={user.id}
                      className={styles.row}
                      data-open={user.id === selected?.id || undefined}
                      onClick={() => void navigate(openPath(user.id))}
                    >
                      <th scope="row">
                        <div className={styles.entity}>
                          <span className={styles.badge} aria-hidden="true">
                            {initials(user)}
                          </span>
                          <div className={styles.stack}>
                            <Link
                              to={openPath(user.id)}
                              className={styles.primary}
                              aria-current={user.id === selected?.id ? "page" : undefined}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {displayName(user)}
                            </Link>
                            <span className={styles.sub}>{user.email}</span>
                          </div>
                          {user.status === "invited" && <span className={styles.tag}>Pending</span>}
                          {user.status === "disabled" && (
                            <span className={styles.tag}>Inactive</span>
                          )}
                        </div>
                      </th>
                      <td>
                        <span className={styles.rolePill}>{ROLE_LABEL[user.role]}</span>
                      </td>
                      <td>All</td>
                      <td className={styles.actions}>
                        <AdminActions admin={user} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {admins.length === 0 && (
                <p className={styles.empty}>
                  {needle
                    ? `No ${filterWord}admins match “${query.trim()}”.`
                    : `No ${filterWord}admins.`}
                </p>
              )}
            </div>
          )}

          {personId && users && !selected && (
            <p className={styles.missing} role="status">
              That person is not an admin here.{" "}
              <Link to={basePath} className={styles.linkButton}>
                Back to all admins
              </Link>
            </p>
          )}
        </div>

        {selected && (
          <div className={styles.panelSlot}>
            <AdminDetailPanel
              key={selected.id}
              admin={selected}
              onClose={() => void navigate(basePath)}
            />
          </div>
        )}
      </div>
    </>
  );
}
