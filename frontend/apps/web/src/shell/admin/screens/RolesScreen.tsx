/**
 * Administration → Roles. What every role is, and what it covers.
 *
 * A REFERENCE PAGE, NOT AN EDITOR. Roles are built-in and defined by Xpredict;
 * an organisation cannot create, clone or edit one (C28). So this exists to
 * answer "what am I about to give this person?" for somebody standing in the
 * invite dialog, and nothing else.
 *
 * IT DOES NOT LIST PERMISSIONS, and that is why it can exist at all. Which
 * permissions each role grants is Q12 and still unanswered — the description
 * is what the server has, and the description is enough to choose between
 * roles. Listing permissions was what made this screen look blocked; it was
 * only ever the permissions that were.
 *
 * TWO SECTIONS, BECAUSE THERE ARE TWO THINGS CALLED A ROLE and confusing them
 * is the mistake this page exists to prevent:
 *
 *   Organisation role  — Owner / Admin / Member. Standing in the ORGANISATION,
 *                        and ALWAYS organisation-wide: anything above Member
 *                        must have no dealership attached, which the database
 *                        enforces with a check constraint (C40). It is the
 *                        column the Users screen shows.
 *
 *   App role           — Sales representative, Service advisor. What you may
 *                        do INSIDE an app. Says nothing about administering.
 *
 * THE TWO NEVER TOUCH, and neither is derived from the other (C40). A dealer
 * admin is a MEMBER holding the DMS System administrator role — not an Admin
 * with a dealership, which is the C31 model this page used to describe and
 * which `membership_org_standing_has_no_unit` now rejects outright.
 *
 * AND A PERSON WITH NO DEALERSHIP IS UNRESTRICTED, not unscoped-by-accident.
 * `resolve_allowed_units()` returns None for them, so somebody organisation-
 * wide in DMS sees every dealership's records (C7) — which is the whole reason
 * the two org-level DMS roles exist and why one of them is read-only.
 *
 * Somebody who sees "Admin" against a person on Users and then opens this page
 * has to find it here, or they will reasonably decide the page is incomplete.
 */

import { asProblem } from "@xpredict/api-client";
import { ErrorState, TableSkeleton } from "@xpredict/ui";

import { useShellContext } from "../../context";
import { findApp } from "../../navigation";
import type { Role } from "../api/roles";
import { useRoles } from "../hooks/useRoles";
import styles from "./RolesScreen.module.css";

/**
 * The three organisation roles, written here rather than fetched.
 *
 * A SMALL, DELIBERATE EXCEPTION to the backend owning the vocabulary (C19).
 * These are a closed enum the frontend already types — `OrgUser.role` is
 * `"owner" | "admin" | "member"` — so the words are here whether or not this
 * page repeats them, and adding an endpoint to serve three constants that
 * cannot change without a frontend release would be ceremony.
 *
 * App roles are the opposite case and come from the server: the backend can
 * add one without a release, which is exactly why they must not be listed
 * here.
 */
const ORG_ROLES = [
  {
    name: "Owner",
    summary:
      "The one person who owns the organisation. Exactly one, never assignable, and cannot be removed or switched off — an organisation without an owner has nobody who could appoint one.",
  },
  {
    name: "Admin",
    summary:
      "Manages the whole organisation: dealers, people and billing. Always organisation-wide — somebody who administers a single dealership is a Member holding the DMS System administrator role instead.",
  },
  {
    name: "Member",
    summary: "Uses the apps they have been given. Administers nothing.",
  },
];

export function RolesScreen() {
  const { membership } = useShellContext();
  const { data: roles, isPending, isError, error, refetch } = useRoles();

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Roles</h1>
        <p className={styles.subtitle}>
          Every role in {membership.org_name}, and what it covers. Roles are the same for
          every organisation and cannot be edited here — they are assigned to people on the
          Users screen.
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Organisation roles</h2>
        <p className={styles.sectionNote}>
          Somebody&rsquo;s standing in {membership.org_name}. This is the Role column on the
          Users screen, and it is separate from what they can do inside an app.
        </p>

        <dl className={styles.roles}>
          {ORG_ROLES.map((role) => (
            <div key={role.name} className={styles.role}>
              <dt className={styles.roleName}>{role.name}</dt>
              <dd className={styles.roleSummary}>{role.summary}</dd>
            </div>
          ))}
        </dl>
      </section>

      {isPending && <TableSkeleton label="roles" columns={[240, "grow"]} rows={6} />}

      {isError && (
        <ErrorState
          title="Could not load app roles"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      )}

      {roles && <AppRoleSections roles={roles} />}
    </div>
  );
}

/**
 * App roles, grouped by the app they belong to.
 *
 * GROUPED IN THE ORDER THE SERVER SENT THEM, not sorted here. The list is
 * ordered deliberately — most capable first, which is the order the invite
 * dialog shows too — and re-sorting would put this page and that dialog in
 * different orders for no reason.
 *
 * An app the server names that this frontend has never heard of still appears,
 * under its raw key. Dropping it would hide a role somebody can actually be
 * given, which is worse than an unpolished heading.
 */
function AppRoleSections({ roles }: { roles: Role[] }) {
  const appKeys = [...new Set(roles.map((role) => role.app))];

  return (
    <>
      {appKeys.map((appKey) => (
        <section key={appKey} className={styles.section}>
          <h2 className={styles.sectionTitle}>{findApp(appKey)?.name ?? appKey} roles</h2>

          <dl className={styles.roles}>
            {roles
              .filter((role) => role.app === appKey)
              .map((role) => (
                <div key={role.code} className={styles.role}>
                  <dt className={styles.roleName}>
                    {role.name}
                    <span className={styles.badges}>
                      {/*
                        The level is the thing most worth showing, because it
                        decides which roles a person can even be offered: a
                        dealer-scoped person can hold only a dealer role, and
                        somebody organisation-wide only an organisation one.
                      */}
                      <span className={styles.badge}>
                        {role.level === "unit" ? "Dealer" : "Organisation"}
                      </span>

                      {/*
                        Worth calling out separately. It is the only property of
                        a role that changes somebody's standing in the
                        organisation rather than what they can do in an app
                        (C31), and it is not obvious from a job title.
                      */}
                      {role.administers && (
                        <span className={`${styles.badge} ${styles.administers}`}>
                          Manages users
                        </span>
                      )}
                    </span>
                  </dt>
                  <dd className={styles.roleSummary}>{role.summary}</dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </>
  );
}
