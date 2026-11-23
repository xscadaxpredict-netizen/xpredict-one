/**
 * Admin panel → User Management → Admins and Roles (C78): ONE sub-module, as
 * Zoho has it (the owner, 2026-11-18), with three tabs.
 *
 *   Admins      who runs the organisation: its owner and its organisation
 *               admins, filtered by their Admin panel role, with what they
 *               manage. Searched by name or email.
 *   App Admins  people who run one app. GREYED OUT (the owner, 2026-11-18):
 *               nothing works behind it yet and what it lists is undecided
 *               (Q63), so it is drawn like Profile's planned tabs -- visible,
 *               not pressable -- and its old address goes to Admins.
 *   Roles       the Admin panel's roles -- Organization Owner and Organization
 *               Admin -- with how many people hold each (`RolesTab`).
 *
 * THE TABS ARE IN THE CATALOGUE (`tabs` on this page's item in
 * `navigation.ts`): label, address, section, and whether it is coming soon.
 * This screen draws them; it does not list them.
 *
 * EACH TAB IS GATED BY ITS OWN SECTION (C79) -- `admin`, `app_admin`, `role`,
 * the tabs of `admins_and_roles` in `/me`'s tree. A tab the person may not see
 * is not drawn, and its address goes to the first tab they may open: somebody
 * holding only `admin.role.view` lands on Roles and never sees Admins.
 *
 * EACH TAB IS ITS OWN ADDRESS (`/admin/admins-and-roles`, `…/roles`), and so
 * is an admin opened beside the list
 * (`…/admin/<membership id>`), so a refresh or a link opens the same thing, and the topbar's box
 * searches the open tab — "Search admins", "Search roles" — emptying when the
 * tab changes, the same as when the page does (`NavItem.search`).
 */

import { asProblem } from "@xpredict/api-client";
import { ErrorState, InfoHint, TableSkeleton } from "@xpredict/ui";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { usePageSearch } from "../../../stores/pageSearchStore";
import { useAccess } from "../../access";
import { useShellContext } from "../../context";
import { tabsOf } from "../../navigation";
import { AdminActions, AdminDetailPanel } from "../components/AdminDetailPanel";
import { ListFilter } from "../components/ListFilter";
import { displayName } from "../components/UserActions";
import { initials } from "../components/UserTable";
import { useAdmins } from "../hooks/useAdmins";
import styles from "./ListPage.module.css";
import { RolesTab } from "./RolesScreen";

/** The tabs, from the catalogue (C79): written once, beside the sub-module. */
const TABS = tabsOf("admin", "admins-and-roles");

export function AdminsAndRolesScreen() {
  const { membership } = useShellContext();
  const access = useAccess();
  // `…/admin/<id>` is the Admins tab with somebody open: no `tab` segment.
  // `…/roles/<code>` is the Roles tab with a role open.
  const { tab = "", personId, roleCode } = useParams<{
    tab: string;
    personId: string;
    roleCode: string;
  }>();
  const basePath = `/${membership.org_slug}/admin/admins-and-roles`;
  const pathOf = (tabPath: string) => (tabPath ? `${basePath}/${tabPath}` : basePath);

  // The tabs this person may see; of those, the ones that open (not greyed).
  const shown = TABS.filter((item) => access.canSee(item.section));
  const openable = shown.filter((item) => !item.comingSoon);

  // An address for a tab they may not open -- hidden, greyed out, or unknown
  // -- goes to the first one they may. With none (only a greyed tab is
  // theirs) the page stays, saying so, rather than bouncing back here forever
  // through the panel's front door.
  const first = openable[0];
  if (first && !openable.some((item) => item.path === tab)) {
    return <Navigate to={pathOf(first.path)} replace />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Admins and Roles</h1>
        <InfoHint label="About Admins and Roles">
          Who runs {membership.org_name}, and the Admin panel&rsquo;s roles. They are built in
          and cannot be edited yet. An app&rsquo;s own roles are given to people on the Users
          screen.
        </InfoHint>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Admins and Roles">
        {shown.map((item) =>
          item.comingSoon ? (
            // `aria-disabled` rather than `disabled`, as on Profile: a keyboard
            // still reaches it and "Coming later" can be read.
            <button
              key={item.path}
              type="button"
              role="tab"
              aria-selected="false"
              aria-disabled="true"
              title="Coming later"
              className={styles.tab}
            >
              {item.label}
            </button>
          ) : (
            <Link
              key={item.path}
              to={pathOf(item.path)}
              role="tab"
              aria-selected={tab === item.path}
              className={styles.tab}
            >
              {item.label}
            </Link>
          ),
        )}
      </div>

      {!first && <p className={styles.empty}>Nothing here is ready for you yet.</p>}
      {first && tab === "" && <AdminsTab basePath={basePath} personId={personId} />}
      {first && tab === "roles" && <RolesTab roleCode={roleCode} />}
    </div>
  );
}

/* ---- Admins -------------------------------------------------------------- */

type AdminFilter = "all" | "owner" | "admin" | "custom";

/** By Admin panel role: the owner, the built-in Organization Admin, the organisation's own. */
const ADMIN_FILTERS = [
  { value: "all", label: "All admins" },
  { value: "owner", label: "Organization Owner" },
  { value: "admin", label: "Organization Admin" },
  { value: "custom", label: "Custom roles" },
] as const;

const FILTER_WORD: Record<Exclude<AdminFilter, "all">, string> = {
  owner: "Organization Owner",
  admin: "Organization Admin",
  custom: "custom role",
};

/**
 * The organisation's admins -- its owner and EVERYBODY HOLDING AN ADMIN PANEL
 * ROLE, built-in or the organisation's own (C89) -- from their OWN endpoint,
 * `GET /admin/admins/`, on the Admins tab's own permission (`admin.admin.view`,
 * C79). It used to be the Users list filtered here, which needed
 * `admin.user.view` and fetched every person to show two.
 *
 * EACH ROW NAMES THE ROLE THEY HOLD (`admin_role.name`, C89): "Application
 * Admin", never "Organization Admin" for somebody who merely holds some Admin
 * panel role.
 *
 * APPS MANAGED is "All" for the owner and an Organization Admin -- each holds
 * every app by rule or by role, organisation-wide -- and a dash for a custom
 * role's holder, who manages no app (C89). An admin of ONE app is what the App
 * Admins tab is for.
 *
 * PICKING A ROW OPENS THE ADMIN BESIDE THE LIST, at its own address, looked up
 * in the FULL list so a search or a filter never closes what is open -- the
 * same rule as Users and Applications.
 */
function AdminsTab({ basePath, personId }: { basePath: string; personId: string | undefined }) {
  const navigate = useNavigate();
  const { data: everyAdmin, isPending, isError, error, refetch } = useAdmins();
  const query = usePageSearch((state) => state.query);
  const [filter, setFilter] = useState<AdminFilter>("all");

  const needle = query.trim().toLowerCase();
  const admins = everyAdmin
    ?.filter((user) => filter === "all" || user.role === filter)
    .filter(
      (user) =>
        needle === "" ||
        `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(needle),
    );
  const filterWord = filter === "all" ? "" : `${FILTER_WORD[filter]} `;
  const selected = personId ? everyAdmin?.find((user) => user.id === personId) : undefined;
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
                        <span className={styles.rolePill}>{user.admin_role.name}</span>
                      </td>
                      <td>
                        {user.apps_managed.length > 0 ? (
                          "All"
                        ) : (
                          <span className={styles.none} aria-label="No apps">
                            —
                          </span>
                        )}
                      </td>
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

          {personId && everyAdmin && !selected && (
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
