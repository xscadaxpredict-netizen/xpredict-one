/**
 * Admin panel -> User Management -> Admins and Roles (C78): tabs Admins, App
 * Admins and Roles, each its own address; the Admins tab filtered by Admin
 * panel role with Admins / Roles / Apps managed; the topbar's box searching
 * whichever tab is open.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";

import AdminRoutes from "../admin/routes";
import type { Admin } from "../admin/api/admins";
import { fetchAdmins } from "../admin/api/admins";
import { fetchApplications } from "../admin/api/applications";
import type * as usersApi from "../admin/api/users";
import { fetchUsers } from "../admin/api/users";
import type { PanelRole } from "../admin/api/roles";
import { fetchPanelRoles } from "../admin/api/roles";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { appAccess, me, membership, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

// The Admins tab's own endpoint (C79). The Users list is mocked only so a
// test can say it was never asked for.
vi.mock("../admin/api/admins", () => ({ fetchAdmins: vi.fn() }));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
}));

vi.mock("../admin/api/applications", () => ({
  fetchApplications: vi.fn().mockResolvedValue([
    { code: "dms", name: "DMS", active: true, members: 3, owner: null },
    { code: "crm", name: "CRM", active: true, members: 1, owner: null },
    { code: "ecommerce", name: "E-commerce", active: false, members: 0, owner: null },
  ]),
  fetchApplicationMembers: vi.fn().mockResolvedValue([]),
}));

vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin/api/roles")>()),
  fetchPanelRoles: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchAdmins = vi.mocked(fetchAdmins);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockFetchApplications = vi.mocked(fetchApplications);
const mockFetchPanelRoles = vi.mocked(fetchPanelRoles);

const withAdmin = [{ path: "admin/*", element: <AdminRoutes /> }];
const BASE = "/acme-motors/admin/admins-and-roles";

/** The apps an admin manages, as `GET /admin/admins/` sends them. */
const MANAGED = [
  { code: "dms", name: "DMS" },
  { code: "crm", name: "CRM" },
];

function admin(overrides: Partial<Admin> & { id: string }): Admin {
  return {
    first_name: "First",
    last_name: "Last",
    email: `${overrides.id}@acme.test`,
    role: "admin",
    status: "active",
    apps_managed: MANAGED,
    ...overrides,
  };
}

/** What the server sends: the owner and the organisation admins, never a member. */
const ADMINS = [
  admin({ id: "asha", first_name: "Asha", last_name: "Rao", role: "owner" }),
  admin({ id: "ravi", first_name: "Ravi", last_name: "Kumar", role: "admin" }),
];

const ROLES: PanelRole[] = [
  {
    code: "owner",
    name: "Organization Owner",
    summary: "Every permission, by rule.",
    built_in: true,
    users: 1,
    modified_by: null,
  },
  {
    code: "admin.org_admin",
    name: "Organization Admin",
    summary: "Runs the organisation.",
    built_in: true,
    users: 1,
    modified_by: null,
  },
];

function names() {
  return screen
    .queryAllByRole("rowheader")
    .map((cell) => within(cell).getByRole("link").textContent);
}

function topbarSearch() {
  return screen.getByRole("searchbox", { name: "Search" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchAdmins.mockResolvedValue(ADMINS);
  mockFetchPanelRoles.mockResolvedValue(ROLES);
});

describe("the tabs", () => {
  it("are Admins, App Admins and Roles, opening on Admins", async () => {
    renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Admins", "App Admins", "Roles"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[2]).toHaveAttribute("href", `${BASE}/roles`);
  });

  it("grey out App Admins: no link, and pressing it goes nowhere", async () => {
    const { router } = renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    const appAdmins = screen.getByRole("tab", { name: "App Admins" });
    expect(appAdmins).toHaveAttribute("aria-disabled", "true");
    expect(appAdmins).not.toHaveAttribute("href");

    fireEvent.click(appAdmins);
    expect(router.state.location.pathname).toBe(BASE);
  });

  it("open on the tab their address names, as after a refresh", async () => {
    renderRoute({ path: `${BASE}/roles`, children: withAdmin });

    expect(await screen.findByRole("columnheader", { name: "Role Name" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Roles" })).toHaveAttribute("aria-selected", "true");
  });

  it("send the old Roles address to the Roles tab", async () => {
    const { router } = renderRoute({ path: "/acme-motors/admin/roles", children: withAdmin });

    await screen.findByRole("columnheader", { name: "Role Name" });
    expect(router.state.location.pathname).toBe(`${BASE}/roles`);
  });

  it("send App Admins' old address to Admins", async () => {
    const { router } = renderRoute({ path: `${BASE}/app-admins`, children: withAdmin });

    await screen.findByRole("table");
    expect(router.state.location.pathname).toBe(BASE);
    expect(screen.getByRole("tab", { name: "Admins" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("the Admins tab", () => {
  it("reads its own endpoint, never the Users list", async () => {
    renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    expect(mockFetchAdmins).toHaveBeenCalledWith("acme-motors");
    expect(mockFetchUsers).not.toHaveBeenCalled();
  });

  it("lists the owner and the organisation admins, never a member", async () => {
    renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    expect(names()).toEqual(["Asha Rao", "Ravi Kumar"]);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Admins",
      "Roles",
      "Apps managed",
      "Actions",
    ]);
    const owner = screen.getByRole("row", { name: /Asha Rao/ });
    expect(within(owner).getByText("Organization Owner")).toBeInTheDocument();
    expect(within(owner).getByText("All")).toBeInTheDocument();
    const admin = screen.getByRole("row", { name: /Ravi Kumar/ });
    expect(within(admin).getByText("Organization Admin")).toBeInTheDocument();
  });

  it("filters by Admin panel role", async () => {
    renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");
    const filter = screen.getByRole("combobox", { name: "Show" });

    expect(within(filter).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All admins",
      "Organization Owner",
      "Organization Admin",
    ]);

    fireEvent.change(filter, { target: { value: "owner" } });
    expect(names()).toEqual(["Asha Rao"]);

    fireEvent.change(filter, { target: { value: "admin" } });
    expect(names()).toEqual(["Ravi Kumar"]);
  });

  it("has an Assign Admin button on the filter's row, greyed out", async () => {
    renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    const assign = screen.getByRole("button", { name: "Assign Admin" });
    expect(assign).toHaveAttribute("aria-disabled", "true");
    expect(assign.parentElement).toContainElement(screen.getByRole("combobox", { name: "Show" }));
  });

  it("links each admin to their own panel", async () => {
    renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    expect(screen.getByRole("link", { name: "Ravi Kumar" })).toHaveAttribute(
      "href",
      `${BASE}/admin/ravi`,
    );
  });
});

describe("the topbar search follows the tab", () => {
  it("searches admins by name or email on Admins", async () => {
    renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    expect(topbarSearch()).toHaveAttribute("placeholder", "Search admins");
    fireEvent.change(topbarSearch(), { target: { value: "ravi@" } });
    expect(names()).toEqual(["Ravi Kumar"]);

    fireEvent.change(topbarSearch(), { target: { value: "nishanth" } });
    expect(screen.getByText("No admins match “nishanth”.")).toBeInTheDocument();
  });

  it("searches roles on Roles", async () => {
    renderRoute({ path: `${BASE}/roles`, children: withAdmin });
    await screen.findByRole("columnheader", { name: "Role Name" });

    expect(topbarSearch()).toHaveAttribute("placeholder", "Search roles");
    fireEvent.change(topbarSearch(), { target: { value: "owner" } });

    expect(screen.getByText("Organization Owner")).toBeInTheDocument();
    expect(screen.queryByText("Organization Admin")).not.toBeInTheDocument();
  });

  it("empties when the tab changes", async () => {
    const { router } = renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");
    fireEvent.change(topbarSearch(), { target: { value: "ravi" } });

    await act(() => router.navigate(`${BASE}/roles`));
    await screen.findByRole("columnheader", { name: "Role Name" });

    expect(topbarSearch()).toHaveValue("");
  });
});


describe("the ⋮ on an admin", () => {
  it("offers Manage Roles and Unassign, both greyed out for now", async () => {
    renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Ravi Kumar" }), {
      key: "Enter",
    });
    const menu = await screen.findByRole("menu");

    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Manage Roles", "Unassign"]);
    for (const item of items) {
      expect(item).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("is not on the owner's row", async () => {
    renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    expect(
      screen.queryByRole("button", { name: "More actions for Asha Rao" }),
    ).not.toBeInTheDocument();
  });

  it("does not open the admin's panel", async () => {
    const { router } = renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "More actions for Ravi Kumar" }));

    expect(router.state.location.pathname).toBe(BASE);
  });
});

describe("an admin opened beside the list", () => {
  it("opens when the row is clicked, at its own address", async () => {
    const { router } = renderRoute({ path: BASE, children: withAdmin });
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("row", { name: /Ravi Kumar/ }));

    const panel = await screen.findByRole("complementary", { name: "Ravi Kumar" });
    expect(router.state.location.pathname).toBe(`${BASE}/admin/ravi`);
    expect(within(panel).getByRole("heading", { name: "Ravi Kumar" })).toBeInTheDocument();
    expect(within(panel).getByText("ravi@acme.test")).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "More actions for Ravi Kumar" }),
    ).toBeInTheDocument();
  });

  it("has Applications working and Groups greyed out", async () => {
    renderRoute({ path: `${BASE}/admin/ravi`, children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "Ravi Kumar" });

    const tabs = within(panel).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Applications", "Groups"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-disabled", "true");
  });

  it("lists every active app as managed", async () => {
    renderRoute({ path: `${BASE}/admin/ravi`, children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "Ravi Kumar" });

    const apps = await within(panel).findByRole("list", { name: "Apps Ravi Kumar manages" });
    const names = within(apps)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("span + div span")?.textContent);
    expect(names).toEqual(["DMS", "CRM"]);
    expect(within(panel).getByText(/As an organization admin, manages every app/)).toBeInTheDocument();
  });

  it("takes the apps from the row, never from the Applications endpoint", async () => {
    // That endpoint needs `admin.application.view`, which the Admins tab does not (C79).
    renderRoute({ path: `${BASE}/admin/ravi`, children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "Ravi Kumar" });
    await within(panel).findByRole("list", { name: "Apps Ravi Kumar manages" });

    expect(mockFetchApplications).not.toHaveBeenCalled();
  });

  it("says the owner manages everything, and has no ⋮", async () => {
    renderRoute({ path: `${BASE}/admin/asha`, children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "Asha Rao" });

    expect(within(panel).getByText(/As the owner, manages every app/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /More actions/ })).not.toBeInTheDocument();
  });

  it("stays open while the list is searched", async () => {
    renderRoute({ path: `${BASE}/admin/ravi`, children: withAdmin });
    await screen.findByRole("complementary", { name: "Ravi Kumar" });

    fireEvent.change(topbarSearch(), { target: { value: "asha" } });

    expect(names()).toEqual(["Asha Rao"]);
    expect(screen.getByRole("complementary", { name: "Ravi Kumar" })).toBeInTheDocument();
    expect(topbarSearch()).toHaveAttribute("placeholder", "Search admins");
  });

  it("closes back to the list", async () => {
    const { router } = renderRoute({ path: `${BASE}/admin/ravi`, children: withAdmin });
    await screen.findByRole("complementary", { name: "Ravi Kumar" });

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

    expect(router.state.location.pathname).toBe(BASE);
  });

  it("says so for somebody who is not an admin", async () => {
    renderRoute({ path: `${BASE}/admin/nish`, children: withAdmin });

    expect(await screen.findByText(/That person is not an admin here/)).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});

describe("each tab follows its own section (C79)", () => {
  function holdingTabs(tabs: string[], permissions: string[]) {
    return me({
      memberships: [
        membership({
          role: "member",
          apps: [
            appAccess("admin", {
              modules: [
                { code: "user_management", sub_modules: [{ code: "admins_and_roles", tabs }] },
              ],
              permissions,
            }),
          ],
        }),
      ],
    });
  }

  function tabNames() {
    return screen.getAllByRole("tab").map((tab) => tab.textContent);
  }

  it("shows only Roles to somebody holding only its view, and sends them there", async () => {
    mockFetchMe.mockResolvedValue(holdingTabs(["role"], ["admin.role.view"]));

    const { router } = renderRoute({ path: BASE, children: withAdmin });

    await screen.findByRole("columnheader", { name: "Role Name" });
    expect(router.state.location.pathname).toBe(`${BASE}/roles`);
    expect(tabNames()).toEqual(["Roles"]);
  });

  it("keeps somebody without Roles' view off the Roles tab", async () => {
    // `admin.admin.view` ALONE: no `admin.user.view`, and the Admins tab still loads.
    mockFetchMe.mockResolvedValue(holdingTabs(["admin"], ["admin.admin.view"]));

    const { router } = renderRoute({ path: `${BASE}/roles`, children: withAdmin });

    await screen.findByRole("columnheader", { name: "Admins" });
    expect(router.state.location.pathname).toBe(BASE);
    expect(tabNames()).toEqual(["Admins"]);
    expect(mockFetchPanelRoles).not.toHaveBeenCalled();
  });

  it("says so, without bouncing, when only a greyed-out tab is theirs", async () => {
    mockFetchMe.mockResolvedValue(holdingTabs(["app_admin"], ["admin.app_admin.view"]));

    const { router } = renderRoute({ path: BASE, children: withAdmin });

    expect(await screen.findByText("Nothing here is ready for you yet.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(BASE);
    expect(screen.getByRole("tab", { name: "App Admins" })).toHaveAttribute("aria-disabled", "true");
  });
});
