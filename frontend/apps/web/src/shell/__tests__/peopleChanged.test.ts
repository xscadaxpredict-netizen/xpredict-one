/**
 * What a change to a person makes stale (`PEOPLE_CHANGED` in `useUsers.ts`).
 *
 * Inviting, editing, deactivating or removing somebody can make them an admin
 * or stop them being one, so the Admins tab (`useAdmins`) and the Roles tab's
 * counts (`usePanelRoles`) must reload too -- or they show yesterday's admins
 * until the page is refreshed.
 */

import { describe, expect, it } from "vitest";

import { PEOPLE_CHANGED, adminKeys } from "../admin/hooks/useUsers";
import { roleKeys } from "../admin/hooks/useRoles";

describe("a change to a person", () => {
  it("refreshes the Users list, the Admins tab and the Roles tab's counts", () => {
    expect(PEOPLE_CHANGED).toEqual([adminKeys.users(), adminKeys.admins(), roleKeys.panel()]);
  });
});
