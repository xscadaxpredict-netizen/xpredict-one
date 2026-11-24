/**
 * DMS settings -> Security & Controls -> Territory Management (the owner,
 * 2026-11-24): DMS's territory tree. `/api/v1/orgs/<slug>/dms/settings/territories/`.
 *
 * Also the tree's rules the screens need before a round trip: what each kind
 * is called, and what it may sit under. THE BACKEND DECIDES (C19); these only
 * keep the form from offering what the server would refuse.
 */

import { request } from "@xpredict/api-client";

export type TerritoryKind = "organisation" | "region" | "dealer" | "branch" | "warehouse";

/** A kind New Territory may create -- never a second organisation. */
export type NewTerritoryKind = Exclude<TerritoryKind, "organisation">;

/**
 * One box of DMS's tree. Mirrors `DmsTerritorySerializer` in
 * `backend/products/dms/app_settings/api/serializers.py`. The list comes in
 * TREE ORDER: every box after its parent.
 */
export interface DmsTerritory {
  id: string;
  kind: TerritoryKind;
  /** The root's is the organisation's name. */
  name: string;
  /** Null for the root only. */
  parent_id: string | null;
  is_root: boolean;
  /** `disabled` reads "Closed". */
  status: "active" | "disabled";
  code: string | null;
  gstin: string;
  pan: string;
  contact_person: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  postal_code: string;
  /** People placed AT this box (not under it). */
  people_count: number;
}

/** What Edit sends: the details. Never the kind, the place or the status. */
export interface TerritoryDetails {
  name: string;
  code: string | null;
  gstin: string;
  pan: string;
  contact_person: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  postal_code: string;
}

/** What New Territory sends: the details, its kind and where it sits. */
export interface NewTerritory extends TerritoryDetails {
  kind: NewTerritoryKind;
  /** Null = directly under the organisation. */
  parent_id: string | null;
}

export const KIND_LABEL: Record<TerritoryKind, string> = {
  organisation: "Organisation",
  region: "Region",
  dealer: "Dealer",
  branch: "Branch",
  warehouse: "Warehouse",
};

/** The kinds New Territory offers, in the order the owner names them. */
export const NEW_KINDS: NewTerritoryKind[] = ["region", "dealer", "branch", "warehouse"];

/**
 * WHAT MAY SIT UNDER WHAT -- `_ALLOWED_PARENTS` in
 * `backend/core/organizations/services.py`, which is the rule. Regions may
 * nest; a dealer sits under the organisation or a region; a branch only in a
 * dealer; a warehouse anywhere but under another warehouse.
 */
export const ALLOWED_PARENTS: Record<NewTerritoryKind, TerritoryKind[]> = {
  region: ["organisation", "region"],
  dealer: ["organisation", "region"],
  branch: ["dealer"],
  warehouse: ["organisation", "region", "dealer", "branch"],
};

/** Said under the "Sits under" box, so a short list is not a mystery. */
export const PARENT_HINT: Record<NewTerritoryKind, string> = {
  region: "A region sits under the organisation or another region.",
  dealer: "A dealer sits under the organisation or a region.",
  branch: "A branch sits inside a dealer.",
  warehouse: "A warehouse sits under the organisation, a region, a dealer or a branch.",
};

export async function fetchTerritories(orgSlug: string): Promise<DmsTerritory[]> {
  return request<DmsTerritory[]>(`/api/v1/orgs/${orgSlug}/dms/settings/territories/`);
}

/** New Territory; answers with the new box. */
export async function createTerritory(orgSlug: string, body: NewTerritory): Promise<DmsTerritory> {
  return request<DmsTerritory>(`/api/v1/orgs/${orgSlug}/dms/settings/territories/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Edit a box's details; answers with the box. */
export async function updateTerritory(
  orgSlug: string,
  territoryId: string,
  body: TerritoryDetails,
): Promise<DmsTerritory> {
  return request<DmsTerritory>(`/api/v1/orgs/${orgSlug}/dms/settings/territories/${territoryId}/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** Close or Reopen a box (never the root); answers with the box. */
export async function setTerritoryStatus(
  orgSlug: string,
  territoryId: string,
  action: "close" | "reopen",
): Promise<DmsTerritory> {
  return request<DmsTerritory>(
    `/api/v1/orgs/${orgSlug}/dms/settings/territories/${territoryId}/${action}/`,
    { method: "POST" },
  );
}

/**
 * Somebody placed AT a territory -- its People tab (2026-11-24). Mirrors
 * `TerritoryPersonSerializer`. `id` is their membership id, as in DMS Users.
 */
export interface TerritoryPerson {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: { code: string; name: string } | null;
  /** Where else they work in DMS, by name. */
  other_places: string[];
  access_status: "active" | "disabled";
  /** Apps they hold that ignore territories: while held, only the organisation. */
  other_apps: string[];
}

/** "the Admin panel and CRM" */
export function namesOf(apps: string[]): string {
  return apps.length <= 1
    ? (apps[0] ?? "")
    : `${apps.slice(0, -1).join(", ")} and ${apps[apps.length - 1] ?? ""}`;
}

export async function fetchTerritoryPeople(
  orgSlug: string,
  territoryId: string,
): Promise<TerritoryPerson[]> {
  return request<TerritoryPerson[]>(
    `/api/v1/orgs/${orgSlug}/dms/settings/territories/${territoryId}/people/`,
  );
}

/** Assign users: ADD this territory to where each works. Answers with the list. */
export async function assignPeople(
  orgSlug: string,
  territoryId: string,
  users: string[],
): Promise<TerritoryPerson[]> {
  return request<TerritoryPerson[]>(
    `/api/v1/orgs/${orgSlug}/dms/settings/territories/${territoryId}/people/`,
    { method: "POST", body: JSON.stringify({ users }) },
  );
}

/** Remove: this territory comes off where they work (their last may go). */
export async function removePerson(
  orgSlug: string,
  territoryId: string,
  personId: string,
): Promise<void> {
  await request<void>(
    `/api/v1/orgs/${orgSlug}/dms/settings/territories/${territoryId}/people/${personId}/`,
    { method: "DELETE" },
  );
}

/** Move: this place swapped for another, their role and other places kept. */
export async function movePerson(
  orgSlug: string,
  territoryId: string,
  personId: string,
  to: string,
): Promise<void> {
  await request<void>(
    `/api/v1/orgs/${orgSlug}/dms/settings/territories/${territoryId}/people/${personId}/move/`,
    { method: "POST", body: JSON.stringify({ to }) },
  );
}
