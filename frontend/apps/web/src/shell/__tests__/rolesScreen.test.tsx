/**
 * Admin panel → Admins and Roles → Roles (C78): the Admin panel's own roles
 * in the shared list format — a filter (All / Built-in / Custom roles), a
 * greyed Add Role, and a table of Role Name, Users and Modified By, searched
 * by the topbar's box by role NAME only (the owner, 2026-11-18).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { fetchPanelRoles } from "../admin/api/roles";
import type * as rolesApi from "../admin/api/roles";
import { RolesTab, roleInitials } from "../admin/screens/RolesScreen";
import { usePageSearch } from "../../stores/pageSearchStore";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof rolesApi>()),
  fetchPanelRoles: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchPanelRoles = vi.mocked(fetchPanelRoles);

const routes = [{ path: "admin/roles", element: <RolesTab /> }];
const PATH = "/acme-motors/admin/roles";

function panelRole(overrides: Partial<rolesApi.PanelRole> & { code: string }): rolesApi.PanelRole {
  return {
    name: overrides.code,
    summary: "Does things.",
    built_in: true,
    users: 0,
    modified_by: null,
    grantable: true,
    ...overrides,
  };
}

const OWNER = panelRole({
  code: "owner",
  name: "Organization Owner",
  summary: "Every permission, by rule.",
  users: 1,
});
const ADMIN = panelRole({
  code: "admin.org_admin",
  name: "Organization Admin",
  summary: "Runs the organisation: its people, dealerships and territories.",
  users: 3,
});

const KNOWN = ["Organization Owner", "Organization Admin", "Billing Admin"];

/** The role named in each body row, top to bottom. */
function names(): (string | undefined)[] {
  return screen
    .queryAllByRole("row")
    .slice(1)
    .map((row) => KNOWN.find((name) => row.textContent?.includes(name)));
}

beforeEach(() => {
  vi.clearAllMocks();
  usePageSearch.setState({ query: "" });
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchPanelRoles.mockResolvedValue([OWNER, ADMIN]);
});

describe("the Roles tab", () => {
  it("lists the Admin panel's roles with Role Name, Users and Modified By", async () => {
    renderRoute({ path: PATH, children: routes });
    await screen.findByRole("table");

    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Role Name",
      "Users",
      "Modified By",
      // The ⋮ column, named for screen readers only.
      "Actions",
    ]);
    expect(names()).toEqual(["Organization Owner", "Organization Admin"]);

    const owner = screen.getByRole("row", { name: /Organization Owner/ });
    expect(within(owner).getByText("Every permission, by rule.")).toBeInTheDocument();
    expect(within(owner).getByText("OO")).toBeInTheDocument();
    expect(within(owner).getByText("1")).toBeInTheDocument();
    expect(within(owner).getByText("—")).toBeInTheDocument();

    const admin = screen.getByRole("row", { name: /Organization Admin/ });
    expect(within(admin).getByText("3")).toBeInTheDocument();
  });

  it("shows who modified a role when somebody has", async () => {
    mockFetchPanelRoles.mockResolvedValue([
      panelRole({ code: "c1", name: "Billing Admin", built_in: false, modified_by: "Asha Rao" }),
    ]);
    renderRoute({ path: PATH, children: routes });

    const row = await screen.findByRole("row", { name: /Billing Admin/ });
    expect(within(row).getByText("Asha Rao")).toBeInTheDocument();
  });

  it("filters All roles, Built-in roles and Custom roles", async () => {
    mockFetchPanelRoles.mockResolvedValue([
      OWNER,
      ADMIN,
      panelRole({ code: "c1", name: "Billing Admin", built_in: false }),
    ]);
    renderRoute({ path: PATH, children: routes });
    await screen.findByRole("table");
    const filter = screen.getByRole("combobox", { name: "Show" });

    expect(within(filter).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All roles",
      "Built-in roles",
      "Custom roles",
    ]);
    expect(names()).toEqual(["Organization Owner", "Organization Admin", "Billing Admin"]);

    fireEvent.change(filter, { target: { value: "built_in" } });
    expect(names()).toEqual(["Organization Owner", "Organization Admin"]);

    fireEvent.change(filter, { target: { value: "custom" } });
    expect(names()).toEqual(["Billing Admin"]);
  });

  it("says there are no custom roles yet", async () => {
    renderRoute({ path: PATH, children: routes });
    await screen.findByRole("table");

    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), {
      target: { value: "custom" },
    });

    expect(screen.getByText("No custom roles yet.")).toBeInTheDocument();
    expect(screen.getByText("0 roles")).toBeInTheDocument();
  });

  it("has Add Role on the filter's row, greyed out", async () => {
    renderRoute({ path: PATH, children: routes });
    await screen.findByRole("table");

    const add = screen.getByRole("button", { name: "Add Role" });
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add.parentElement).toContainElement(screen.getByRole("combobox", { name: "Show" }));
  });

  it("searches by role name only, never the summary", async () => {
    renderRoute({ path: PATH, children: routes });
    await screen.findByRole("table");

    usePageSearch.setState({ query: "admin" });
    expect(await screen.findByText("1 role")).toBeInTheDocument();
    expect(names()).toEqual(["Organization Admin"]);

    // In Organization Admin's summary, not in any name.
    usePageSearch.setState({ query: "dealerships" });
    expect(await screen.findByText("No roles match “dealerships”.")).toBeInTheDocument();
  });

  it("offers a retry when the roles cannot be loaded", async () => {
    mockFetchPanelRoles.mockRejectedValue(new Error("nope"));

    renderRoute({ path: PATH, children: routes });

    expect(await screen.findByText(/Could not load roles/i)).toBeInTheDocument();
  });
});

describe("roleInitials", () => {
  it("is the first letter of the first two words", () => {
    expect(roleInitials("Organization Owner")).toBe("OO");
    expect(roleInitials("Organization Admin")).toBe("OA");
    expect(roleInitials("Helpdesk  admin for things")).toBe("HA");
    expect(roleInitials("Auditor")).toBe("A");
  });
});
