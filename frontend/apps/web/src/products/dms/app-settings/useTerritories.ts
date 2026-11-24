import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";

import { dealerKeys } from "../../../shell/admin/hooks/useDealers";
import {
  assignPeople,
  createTerritory,
  fetchTerritories,
  fetchTerritoryPeople,
  movePerson,
  removePerson,
  setTerritoryStatus,
  updateTerritory,
  type NewTerritory,
  type TerritoryDetails,
} from "./territories";
import { dmsSettingsKeys } from "./useDmsUsers";

export const territoryKeys = {
  all: () => ["dms", "settings", "territories"] as const,
  people: (territoryId: string) =>
    ["dms", "settings", "territories", territoryId, "people"] as const,
};

/*
 * A change here is also seen on the Admin panel's Dealers list (the same
 * dealers, until that screen goes -- Q79) and on DMS settings -> Users (each
 * person's territory names), so those refresh with the tree.
 */
const TERRITORIES_CHANGED = [territoryKeys.all(), dealerKeys.all(), dmsSettingsKeys.users()];

/** DMS's whole territory tree, in tree order. */
export function useDmsTerritories() {
  return useOrgQuery({
    key: territoryKeys.all(),
    queryFn: (orgSlug) => fetchTerritories(orgSlug),
  });
}

/** New Territory. */
export function useCreateTerritory() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: NewTerritory) => createTerritory(orgSlug, body),
    invalidates: TERRITORIES_CHANGED,
  });
}

/** Edit a box's details. */
export function useUpdateTerritory() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { territoryId: string; body: TerritoryDetails & { parent_id?: string | null } },
    ) => updateTerritory(orgSlug, variables.territoryId, variables.body),
    invalidates: TERRITORIES_CHANGED,
  });
}

/** Close or Reopen a box. */
export function useSetTerritoryStatus() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { territoryId: string; action: "close" | "reopen" }) =>
      setTerritoryStatus(orgSlug, variables.territoryId, variables.action),
    invalidates: TERRITORIES_CHANGED,
  });
}

/*
 * PLACING SOMEBODY changes the tree's counts, every People tab that lists them
 * (the territory key is a prefix of each one), DMS Users' Territory column and
 * the Admin panel's Dealers counts -- the same set as a territory change.
 */

/** Who works at this territory (its People tab). */
export function useTerritoryPeople(territoryId: string) {
  return useOrgQuery({
    key: territoryKeys.people(territoryId),
    queryFn: (orgSlug) => fetchTerritoryPeople(orgSlug, territoryId),
  });
}

/** Assign users: add this territory to where each works. */
export function useAssignPeople() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { territoryId: string; users: string[] }) =>
      assignPeople(orgSlug, variables.territoryId, variables.users),
    invalidates: TERRITORIES_CHANGED,
  });
}

/** Remove somebody from this territory. */
export function useRemovePerson() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { territoryId: string; personId: string }) =>
      removePerson(orgSlug, variables.territoryId, variables.personId),
    invalidates: TERRITORIES_CHANGED,
  });
}

/** Move somebody from this territory to another. */
export function useMovePerson() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { territoryId: string; personId: string; to: string }) =>
      movePerson(orgSlug, variables.territoryId, variables.personId, variables.to),
    invalidates: TERRITORIES_CHANGED,
  });
}
