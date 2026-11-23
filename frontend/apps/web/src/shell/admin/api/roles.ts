/**
 * The roles a person can hold inside an app. No React in this file.
 *
 * TWO DIFFERENT THINGS ARE CALLED "ROLE", and confusing them is the mistake
 * this file exists to make hard:
 *
 *   Membership.role  — owner / admin / member. Standing in the ORGANISATION,
 *                      and always organisation-wide: anything above `member`
 *                      must have no dealership attached (C40). Set on the
 *                      invite and edit forms directly.
 *
 *   AppAccess.role   — THIS. What you may do INSIDE an app: Sales
 *                      representative, Service advisor. Says nothing about
 *                      administering.
 *
 * THE TWO NEVER TOUCH and neither is derived from the other (C40). A dealer
 * admin is `member` + the DMS `System administrator` role; an ordinary
 * salesperson is `member` + `Sales representative`.
 *
 * This used to say a dealer admin was `admin` + `Dealer manager` — the C31
 * model, with two roles that no longer exist. The database now refuses
 * `admin` with a dealership attached outright.
 *
 * THE LIST COMES FROM THE SERVER, and the frontend must not hardcode it — the
 * same argument as the opaque permission strings in C19. A union type here
 * would mean a frontend release before anybody could be given a new role, and
 * the two lists would drift the first time somebody was in a hurry. Roles are
 * built-in and defined by Xpredict (C28), so this endpoint is reference data:
 * the same answer for every organisation, seeded by a data migration.
 *
 * WHAT EACH ROLE MAY ACTUALLY DO IS NOT HERE. `permissions` is Q12 and still
 * unanswered, which is exactly why the Roles screen cannot be built yet and
 * this select can. Assigning a role needs its name; displaying what it grants
 * needs the list.
 */

import { request } from "@xpredict/api-client";

/**
 * Whether a role scopes its holder to one dealership or to the whole
 * organisation (C7's `Role.level`).
 *
 * It is what makes the select honest: a dealer-scoped person can only hold a
 * `unit` role, and somebody organisation-wide can only hold an `org` one.
 * Offering the wrong ones would produce records the backend is right to refuse.
 */
export type RoleLevel = "org" | "unit";

export interface Role {
  /** Stable, the backend's vocabulary. Never parsed here. */
  code: string;
  /** What a person is shown: "Sales executive". */
  name: string;
  /** Which app it belongs to — dms, crm, ecommerce. */
  app: string;
  level: RoleLevel;
  /** One line under the name in the picker. Copy, not data. */
  summary: string;
  /**
   * Whether holding this role makes the person an administrator of their
   * scope — at a dealership, that they can add and remove that dealership's
   * users.
   *
   * IT WRITES NOTHING INTO STANDING (C40). This said holding the role sets
   * `Membership.role: "admin"` with the dealership attached, which was C31 and
   * is now a row the database REFUSES: anything above `member` must have
   * `unit_id` null. Standing and app role are independent axes and neither is
   * derived from the other, so a dealer admin keeps `member` standing and is
   * an admin purely by holding this role.
   *
   * On the server this field is DERIVED, never stored — "does this role grant
   * any `admin.*` permission" (C44 makes it a join). So it cannot drift from
   * what the role actually grants.
   *
   * IT LIVES ON THE ROLE, not in the form. The form must not carry a list of
   * "roles that also make you an admin" — that is the backend's vocabulary
   * (C19), and a hardcoded role code here would be wrong the first time a role
   * was renamed or added. The form asks the role what it confers.
   */
  administers: boolean;
}

/* ---------------------------- real shape -------------------------------- */

export async function fetchRoles(orgSlug: string): Promise<Role[]> {
  return request<Role[]>(`/api/v1/orgs/${orgSlug}/admin/roles/`);
}

/**
 * The roles that can actually be given for one app at one scope.
 *
 * `unitScoped` is whether the PERSON belongs to a dealership, not whether the
 * app has dealerships — a person scoped to one can hold only `unit` roles, and
 * somebody organisation-wide only `org` ones.
 *
 * Returns them in the order the server sent, which is the order they are meant
 * to be read in.
 */
export function rolesFor(roles: Role[], app: string, unitScoped: boolean): Role[] {
  return roles.filter((role) => role.app === app && role.level === (unitScoped ? "unit" : "org"));
}

/* ------------------------- the Admin panel's roles ------------------------ */

/**
 * One row of the Admin panel's Roles tab (C78): Organization Owner or
 * Organization Admin. Mirrors `PanelRoleSerializer` -- hand-written on both
 * sides (C43), so a field renamed there is an empty column here.
 *
 * NOT `Role`. That is an APP role (DMS's Manager, Technician) and is what the
 * invite and edit forms' pickers read; this is the Admin panel's own, with how
 * many people hold it in THIS organisation.
 */
export interface PanelRole {
  /** "owner" for the owner (a rule, not a role row), else the role's code. */
  code: string;
  name: string;
  summary: string;
  /** False for one the organisation made in New Role (C72 piece 5). */
  built_in: boolean;
  /** Everyone holding it: active, deactivated and pending. */
  users: number;
  /** Who last changed it -- always null for a built-in role. */
  modified_by: string | null;
  /**
   * Whether THE VIEWER may give it in Assign Admin (C89): it grants nothing
   * they do not hold. Never the owner's row. Greys the picker only.
   */
  grantable: boolean;
}

export async function fetchPanelRoles(orgSlug: string): Promise<PanelRole[]> {
  return request<PanelRole[]>(`/api/v1/orgs/${orgSlug}/admin/panel-roles/`);
}

/* ------------------- the role builder (C72 piece 5) ---------------------- */

/** One thing a page lets you do. Mirrors `_BuilderActionSerializer`. */
export interface BuilderAction {
  /** "view", "create", "update", "delete", or a special one: "assign_app". */
  code: string;
  /** What the grid shows: "View", "Edit", "Assign app". */
  name: string;
  /** "basic": the fixed View / Create / Edit / Delete columns. "special": More Permissions. */
  kind: "basic" | "special";
  /** The permission it grants: "admin.user.view". */
  permission: string;
}

/** One row of the grid: a page or a tab. */
export interface BuilderRow {
  code: string;
  name: string;
  actions: BuilderAction[];
}

/** One card: a module of the Admin panel. */
export interface BuilderModule {
  code: string;
  name: string;
  rows: BuilderRow[];
}

/** A role "Copy permissions from" offers. */
export interface BuilderTemplate {
  code: string;
  name: string;
  permissions: string[];
}

/**
 * What the New Role grid draws: the Admin panel's section tree, READ FROM THE
 * SERVER rather than typed here, so a new page or action appears by itself.
 */
export interface RoleBuilder {
  modules: BuilderModule[];
  templates: BuilderTemplate[];
}

export async function fetchRoleBuilder(orgSlug: string): Promise<RoleBuilder> {
  return request<RoleBuilder>(`/api/v1/orgs/${orgSlug}/admin/role-builder/`);
}

/** New Role's form. `permissions` are permission codes. */
export interface NewPanelRole {
  name: string;
  description: string;
  permissions: string[];
}

export async function createPanelRole(orgSlug: string, body: NewPanelRole): Promise<PanelRole> {
  return request<PanelRole>(`/api/v1/orgs/${orgSlug}/admin/panel-roles/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Edit Role: the same body as New Role. The list REPLACES the role's
 * permissions; the code never changes. Answers with the Roles tab's row.
 */
export async function updatePanelRole(
  orgSlug: string,
  code: string,
  body: NewPanelRole,
): Promise<PanelRole> {
  return request<PanelRole>(`/api/v1/orgs/${orgSlug}/admin/panel-roles/${code}/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Delete Role. Refused with 409 `role_in_use` while anybody holds it (a member
 * or a pending person), and `built_in_role_unchangeable` for a built-in.
 */
export async function deletePanelRole(orgSlug: string, code: string): Promise<void> {
  await request<void>(`/api/v1/orgs/${orgSlug}/admin/panel-roles/${code}/`, { method: "DELETE" });
}
