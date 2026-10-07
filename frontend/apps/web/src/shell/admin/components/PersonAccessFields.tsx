/**
 * Where somebody works, what they can open, and what they are in each app —
 * asked once, by both the invite form and the edit form.
 *
 * WHY THIS EXISTS. The two dialogs asked the same three questions in different
 * orders with different controls: invite asked scope first with a radio pair
 * (C30), edit asked apps first and offered the dealership as one option in a
 * dropdown. They also built the same payload from two separate copies of the
 * rules, and they had already drifted — C30 records that the edit form "keeps
 * the older layout", which it still did until now.
 *
 * That is exactly the shape C23 warns about: two screens writing one record and
 * then disagreeing about what the rules are. The rules now live here.
 *
 * SCOPE IS ASKED BEFORE ACCESS, which is C30 and is not a layout preference:
 * the dealership is an organisational fact about a person and their apps follow
 * from it (C7, C27). Asking apps first meant ticking DMS purely to unlock a
 * dealer picker — a hoop — and it made "belongs to a dealership" read as a
 * property of DMS rather than of the person.
 *
 * THE PAYLOAD IS DERIVED FROM THE SCOPE, never assembled from whatever the
 * fields happen to hold. That is what makes C27 structural rather than policed:
 * a dealer-scoped person cannot carry CRM because nothing reads the app ticks
 * on that branch, and an organisation-wide one cannot carry a dealership
 * because nothing reads the chosen unit. Switching back and forth leaves the
 * other branch's answers alone for convenience, and they are simply never sent.
 *
 * NONE OF THIS IS SECURITY (C19). Django refuses an illegal grant whatever this
 * offers; these are the controls, and if the two ever disagree Django is right.
 */

import { useState } from "react";

import type { Membership } from "../../api/auth";
import type { Dealer } from "../api/dealers";
import { findApp, grantableApps } from "../../navigation";
import { rolesFor, type Role } from "../api/roles";
import { dealerScopeRules, isDealerScopable } from "../dealerScope";
import { useDealers } from "../hooks/useDealers";
import { useRoles } from "../hooks/useRoles";
import { RolePicker } from "./RolePicker";
import styles from "./PersonAccessFields.module.css";

/** One app somebody already holds, and the role code they hold it with. */
export interface HeldApp {
  app: string;
  roleCode: string;
}

export interface PersonAccessInitial {
  /** Their dealership, or null for organisation-wide. */
  unitId: string | null;
  apps: HeldApp[];
  orgRole: "admin" | "member";
}

export interface UsePersonAccessOptions {
  /** The CALLER's membership — what they are allowed to offer (C23). */
  membership: Membership;
  /** What the person holds now. Absent for an invitation, which starts blank. */
  initial?: PersonAccessInitial;
}

export interface PersonAccess {
  scope: "org" | "dealer";
  setScope: (scope: "org" | "dealer") => void;
  unitId: string;
  setUnitId: (unitId: string) => void;
  selectedApps: string[];
  toggleApp: (appKey: string) => void;
  setAppRole: (appKey: string, roleCode: string) => void;
  orgRole: "admin" | "member";
  setOrgRole: (role: "admin" | "member") => void;

  /** Whether the PERSON ends up scoped to a dealership. */
  personIsUnitScoped: boolean;
  /** Whether the CALLER is a dealer admin, who never sees the scope question. */
  callerIsDealerAdmin: boolean;

  optionsFor: (appKey: string) => Role[];
  roleFor: (appKey: string) => string;

  /**
   * The apps this person held when the form opened.
   *
   * Separate from `selectedApps` because unticking one must not make its
   * checkbox vanish — see the repair case in the fields below.
   */
  initialApps: string[];

  /**
   * The dealerships available to choose, and whether they are still arriving.
   *
   * On the hook rather than fetched again in the fields, so the two cannot end
   * up asking for different lists — and so the `enabled` rule that stops an
   * organisation-wide invitation requesting every dealership lives in one
   * place.
   */
  dealers: Dealer[];
  dealersPending: boolean;

  /** `{ unit_id, apps, role }` — ready to spread into a request body. */
  payload: () => {
    unit_id: string | null;
    apps: { app: string; role: string }[];
    role: "admin" | "member";
  };
  /** A message naming what is unanswered, or null when the form may be sent. */
  problem: () => string | null;
}

export function usePersonAccess({ membership, initial }: UsePersonAccessOptions): PersonAccess {
  const callerIsDealerAdmin = membership.unit_id !== null;

  const [scope, setScope] = useState<"org" | "dealer">(initial?.unitId ? "dealer" : "org");
  const [unitId, setUnitId] = useState<string>(initial?.unitId ?? "");
  const [selectedApps, setSelectedApps] = useState<string[]>(
    initial?.apps.map((held) => held.app) ?? [],
  );
  /*
   * Seeded from what they hold NOW, so opening the form to fix a spelling and
   * saving leaves their roles exactly as they were (C25). Keyed by app,
   * because somebody can hold several and being a Manager in DMS says nothing
   * about what they are in CRM.
   */
  const [appRoles, setAppRoles] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.apps ?? []).map((held) => [held.app, held.roleCode])),
  );
  const [orgRole, setOrgRole] = useState<"admin" | "member">(initial?.orgRole ?? "member");

  const scopedToDealer = scope === "dealer";
  /*
   * Whether the PERSON belongs to a dealership, which is not the same question
   * as which radio is selected. A dealer admin never sees the radio —
   * everybody they touch is at their own dealership (C23) — and reading the
   * radio for them offered the ORG-level roles, so the one question they get
   * came back "Fleet viewer": a read-only role across every dealership, for
   * somebody who can only ever see one.
   */
  const personIsUnitScoped = callerIsDealerAdmin || scopedToDealer;

  const { data: roles } = useRoles();
  const { data: dealers, isPending: dealersPending } = useDealers({
    // Most people are organisation-wide, and a request nobody needed is still
    // a request. A dealer admin never opens the picker and would not be
    // entitled to a list of every dealership anyway.
    enabled: scopedToDealer && !callerIsDealerAdmin,
  });

  function optionsFor(appKey: string) {
    return rolesFor(roles ?? [], appKey, personIsUnitScoped);
  }

  /**
   * The role chosen for an app, or "" while the question is open.
   *
   * ONE OPTION IS PRESELECTED; SEVERAL ARE NOT. Where a single role is
   * possible there is no decision to make. Where several are, this stays empty
   * and the form refuses to send — the list is ordered most-capable first, so
   * defaulting would quietly grant the most powerful role to anybody who did
   * not look. Fail closed.
   *
   * A role already held wins over both, which is C25: an edit about a spelling
   * must not reassign anybody.
   */
  function roleFor(appKey: string) {
    const chosen = appRoles[appKey];
    if (chosen && optionsFor(appKey).some((role) => role.code === chosen)) return chosen;

    const options = optionsFor(appKey);
    return options.length === 1 ? (options[0]?.code ?? "") : "";
  }

  function payload() {
    if (callerIsDealerAdmin) {
      /*
       * Their own dealership and DMS, decided here rather than asked (C23).
       * ALWAYS `member` standing, even when appointing another dealer admin:
       * the DMS role carries that now (C40), and the database refuses `admin`
       * with a dealership attached.
       */
      return {
        unit_id: membership.unit_id,
        apps: [{ app: "dms", role: roleFor("dms") }],
        role: "member" as const,
      };
    }

    if (scopedToDealer) {
      /*
       * DMS IS IMPLICIT HERE. Choosing a dealership IS choosing DMS (C30) —
       * it is the only unit-aware product, so the branch offers no app
       * checkboxes and nothing ticks it. Deriving the list from
       * `selectedApps` alone sent an empty `apps` for every invitation, which
       * is how this was caught.
       *
       * PLUS ANYTHING THEY ALREADY HOLD THAT THEY SHOULD NOT. An invitation
       * can only ever create a legal combination, but an EDIT may be looking
       * at somebody granted CRM before C27 existed. Dropping it silently would
       * repair the record behind the admin's back; the fields below surface it
       * as a ticked box instead, so removing it is something they did.
       */
      const held = selectedApps.filter((app) => !isDealerScopable(app));
      return {
        unit_id: unitId,
        apps: ["dms", ...held].map((app) => ({ app, role: roleFor(app) })),
        role: "member" as const,
      };
    }

    return {
      unit_id: null,
      apps: selectedApps.map((app) => ({ app, role: roleFor(app) })),
      role: orgRole,
    };
  }

  function problem() {
    // No "no dealership" entry in the picker — the organisation is a different
    // radio — so an empty one means the branch was chosen and not answered.
    if (!callerIsDealerAdmin && scopedToDealer && !unitId) {
      return "Select the dealer this user belongs to.";
    }

    const unanswered = payload().apps.filter((grant) => !grant.role);
    if (unanswered.length > 0) {
      return roles
        ? `Choose a role for ${unanswered.map((grant) => grant.app.toUpperCase()).join(" and ")}.`
        : "Roles are still loading. Try again in a moment.";
    }

    return null;
  }

  return {
    scope,
    setScope,
    unitId,
    setUnitId,
    selectedApps,
    toggleApp: (appKey) =>
      setSelectedApps((current) =>
        current.includes(appKey)
          ? current.filter((app) => app !== appKey)
          : [...current, appKey],
      ),
    setAppRole: (appKey, roleCode) =>
      setAppRoles((current) => ({ ...current, [appKey]: roleCode })),
    orgRole,
    setOrgRole,
    personIsUnitScoped,
    callerIsDealerAdmin,
    optionsFor,
    roleFor,
    initialApps: initial?.apps.map((held) => held.app) ?? [],
    payload,
    problem,
    dealers: dealers ?? [],
    dealersPending,
  };
}

export interface PersonAccessFieldsProps {
  access: PersonAccess;
  membership: Membership;
  /**
   * A dealership to keep in the picker even if it has closed — the one this
   * person already belongs to.
   *
   * Without it, opening the form for somebody at a closed dealership would
   * show their dealership missing and silently move them to "Organisation" on
   * save. An invitation passes nothing: putting a NEW person into a closed
   * dealership creates somebody who can see nothing on their first day, and
   * the backend would be right to refuse it.
   */
  keepUnitId?: string | null;
  /** The owner's standing cannot be changed here (C14). */
  lockOrgRole?: boolean;
  /** Shown above the scope question. */
  scopeHint?: string;
}

export function PersonAccessFields({
  access,
  membership,
  keepUnitId = null,
  lockOrgRole = false,
  scopeHint,
}: PersonAccessFieldsProps) {
  /*
   * WHAT THIS ORGANISATION BOUGHT, not what the person filling in the form can
   * open. `visibleApps()` is the launcher's rule and hides an app you are
   * subscribed to but cannot open — which meant an admin who had dropped DMS
   * could no longer grant it to anybody, including back to themselves.
   */
  const apps = grantableApps(membership);

  const dealerOptions =
    access.dealers.filter(
      (dealer) => dealer.status === "active" || dealer.id === keepUnitId,
    );

  const scopedToDealer = access.scope === "dealer";
  const rules = dealerScopeRules(access.selectedApps, scopedToDealer ? access.unitId : "");

  /*
   * Apps this person ARRIVED holding that a dealership person may not hold
   * (C27).
   *
   * Normally empty, and then the dealership branch shows no checkbox list at
   * all — C30's shape, because a list where two of three entries are
   * permanently disabled is a question with one answer.
   *
   * It is not empty for a record that predates C27, or one a backend let
   * through. Those have to be fixable, and the only edit that fixes them is
   * removing the app, so they appear as ticked boxes that can be unticked.
   *
   * FROM `initialApps`, NOT FROM WHAT IS TICKED, which is the difference
   * between a control that explains itself and one that vanishes under the
   * cursor: after unticking, the box stays and goes disabled, saying "gone,
   * and it cannot come back while they belong to a dealer". Deriving it from
   * the current selection removed the checkbox the instant it was used.
   */
  const repairable = access.initialApps.filter((app) => !isDealerScopable(app));

  if (access.callerIsDealerAdmin) {
    return (
      <>
        <p className={styles.note}>
          They belong to <strong>{membership.unit_name}</strong> with access to DMS.
          Anything else in {membership.org_name} is granted by an organisation admin.
        </p>

        {/*
          The one question a dealer admin still gets. Which dealership and which
          app are both decided for them (C23), but a salesperson and a service
          advisor are not the same job, and only the person hiring knows which.
        */}
        <RolePicker
          appName="DMS"
          appKey="dms"
          options={access.optionsFor("dms")}
          value={access.roleFor("dms")}
          onChange={(code) => access.setAppRole("dms", code)}
        />
      </>
    );
  }

  return (
    <>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Scope</legend>
        <p className={styles.hint}>
          {scopeHint ??
            `Whether this person works across ${membership.org_name} or for a single dealer.`}
        </p>

        <label className={styles.choice}>
          <input
            type="radio"
            name="scope"
            checked={!scopedToDealer}
            onChange={() => access.setScope("org")}
          />
          <span>Organisation</span>
        </label>

        <label className={styles.choice}>
          <input
            type="radio"
            name="scope"
            checked={scopedToDealer}
            onChange={() => access.setScope("dealer")}
          />
          <span>Dealership</span>
        </label>

        {scopedToDealer && (
          <>
            {/* A real <label>, not an aria-label: it is a question somebody has
                to answer, so it belongs on screen and not only in a reader. */}
            <label className={styles.label} htmlFor="person-dealer">
              Select dealer
            </label>
            <select
              id="person-dealer"
              className={styles.select}
              value={access.unitId}
              onChange={(event) => access.setUnitId(event.target.value)}
            >
              <option value="">Choose a dealer…</option>
              {access.dealersPending && <option disabled>Loading dealers…</option>}
              {dealerOptions.map((dealer) => (
                <option key={dealer.id} value={dealer.id}>
                  {dealer.name}
                </option>
              ))}
            </select>
          </>
        )}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>App access</legend>

        {scopedToDealer ? (
          <>
            <p className={styles.hint}>
              <strong>DMS</strong>, limited to this dealer. CRM and E-commerce are
              organisation-wide and cannot be granted to a dealership user.
            </p>

            {repairable.length > 0 && (
              <>
                <div className={styles.choices}>
                  {repairable.map((appKey) => (
                    <label key={appKey} className={styles.choice}>
                      <input
                        type="checkbox"
                        checked={access.selectedApps.includes(appKey)}
                        // Removing is never blocked, only adding back.
                        disabled={!access.selectedApps.includes(appKey)}
                        onChange={() => access.toggleApp(appKey)}
                      />
                      <span>{appName(appKey)}</span>
                    </label>
                  ))}
                </div>
                <p className={styles.warning}>
                  This person holds an app that a dealership user cannot have. Untick it
                  to bring their access into line — it cannot be granted again while they
                  belong to a dealer.
                </p>
              </>
            )}

            <RolePicker
              appName="DMS"
              appKey="dms"
              options={access.optionsFor("dms")}
              value={access.roleFor("dms")}
              onChange={(code) => access.setAppRole("dms", code)}
            />
          </>
        ) : (
          <>
            <p className={styles.hint}>
              The apps this person can open. Only apps {membership.org_name} subscribes to
              are listed.
            </p>

            <div className={styles.choices}>
              {apps.map((app) => (
                <label key={app.key} className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={access.selectedApps.includes(app.key)}
                    disabled={rules.isAppLocked(app.key)}
                    onChange={() => access.toggleApp(app.key)}
                  />
                  <span>{app.name}</span>
                </label>
              ))}
            </div>

            {/* One per app they hold, in the app list's order, so ticking DMS
                puts its role directly under the tick. */}
            {apps
              .filter((app) => access.selectedApps.includes(app.key))
              .map((app) => (
                <RolePicker
                  key={app.key}
                  appName={app.name}
                  appKey={app.key}
                  options={access.optionsFor(app.key)}
                  value={access.roleFor(app.key)}
                  onChange={(code) => access.setAppRole(app.key, code)}
                />
              ))}
          </>
        )}
      </fieldset>

      {/*
        HIDDEN FOR A DEALERSHIP PERSON (C34, C40). "Admin at this dealer" and
        "admin of the organisation" would be the same field, and only the first
        is available to somebody scoped to a dealership — so it is carried by
        their DMS role instead. Leaving the control here would be two things
        writing one value and free to disagree.

        Owner is never offered: exactly one per organisation (C14), so
        appointing one is a transfer rather than an edit. Q23.

        The fieldset carries no legend: it is here for `disabled`, which is how
        the owner's standing is locked, and the label inside is already the
        heading. Two headings for one select is clutter.
      */}
      {!scopedToDealer && (
        <fieldset className={styles.fieldset} disabled={lockOrgRole}>
          <label className={styles.label} htmlFor="person-org-role">
            Organisation role
          </label>
          <select
            id="person-org-role"
            className={styles.select}
            value={access.orgRole}
            onChange={(event) => access.setOrgRole(event.target.value as "admin" | "member")}
          >
            <option value="member">Member</option>
            <option value="admin">Admin — can manage the organisation</option>
          </select>

          <p className={styles.hint}>
            {lockOrgRole
              ? "The owner's standing cannot be changed here. Transfer ownership to somebody else first."
              : `Admins manage dealerships, people and billing for ${membership.org_name}. Members only use the apps above.`}
          </p>
        </fieldset>
      )}
    </>
  );
}

/** An app's display name, falling back to its key if the catalog lacks it. */
/**
 * An app's display name, from the CATALOG rather than from the grantable list.
 *
 * The repair case below shows an app somebody holds illegally, and the
 * organisation may since have stopped subscribing to it — so it is not in the
 * grantable list, and looking it up there would label the checkbox "CRM"
 * instead of "CRM". The catalog knows every app this frontend can draw.
 */
function appName(appKey: string): string {
  return findApp(appKey)?.name ?? appKey.toUpperCase();
}
