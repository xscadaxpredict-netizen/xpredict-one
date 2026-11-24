/**
 * Each app's own role on `/me` (the owner, 2026-11-24: "each app will have
 * their own role"). The Admin panel's is the admin app's role; the separate
 * `Membership.admin_role` it replaced has been removed, so the screens that
 * name somebody by their Admin panel role read it from the app.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { adminPanelRole, appRole } from "../appRole";
import { renderRoute } from "./harness";
import { appAccess, me, membership, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchMe = vi.mocked(fetchMe);

const BRANCH_ADMIN = { code: "admin.custom_branch", name: "Branch Admin" };

/** Somebody holding one of the organisation's own Admin panel roles -- on the app only. */
function branchAdmin(overrides: Parameters<typeof membership>[0] = {}) {
  return membership({
    role: "member",
    apps: [
      appAccess("dms", { role: { code: "dms.fleet_viewer", name: "Fleet viewer" } }),
      appAccess("admin", { permissions: ["admin.user.view"], role: BRANCH_ADMIN }),
    ],
    ...overrides,
  });
}

beforeEach(() => {
  mockFetchMe.mockReset();
});

describe("appRole and adminPanelRole", () => {
  it("read each app's own role", () => {
    const person = branchAdmin();

    expect(appRole(person, "dms")).toEqual({ code: "dms.fleet_viewer", name: "Fleet viewer" });
    expect(adminPanelRole(person)).toEqual(BRANCH_ADMIN);
  });

  it("say null for an app with no role, or one not in the list", () => {
    const person = branchAdmin();

    expect(appRole(person, "crm")).toBeNull();
    expect(adminPanelRole(membership({ apps: [] }))).toBeNull();
  });
});

describe("the screens read the Admin panel role from the admin app", () => {
  it("the launcher names it", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [branchAdmin()] }));

    renderRoute({ path: "/acme-motors" });

    expect(await screen.findByText(/Branch Admin in the Admin panel/)).toBeInTheDocument();
  });

  it("the organisation switcher names it", async () => {
    mockFetchMe.mockResolvedValue(
      me({
        memberships: [
          ownerMembership(),
          branchAdmin({ org_id: "org-2", org_name: "Globex Cars", org_slug: "globex-cars" }),
        ],
      }),
    );

    renderRoute({ path: "/acme-motors" });
    fireEvent.click(await screen.findByRole("button", { name: /^Switch organisation/ }));
    const drawer = await screen.findByRole("dialog", { name: "Organisations" });

    expect(within(drawer).getByRole("button", { name: /^Globex Cars/ })).toHaveTextContent(
      "Branch Admin",
    );
  });
});
