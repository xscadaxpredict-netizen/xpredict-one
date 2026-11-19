/**
 * The Admin panel (C78): reached from the shield in the topbar instead of a
 * tile in the launcher, with the owner's modules in a one-at-a-time accordion.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import type { AppModule } from "../api/auth";
import AdminRoutes from "../admin/routes";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import {
  appAccess,
  dealerAdminMembership,
  me,
  membership,
  ownerMembership,
  salespersonMembership,
} from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

// Profile is a real page now; its request is answered here so these tests
// stay about the frame around it.
vi.mock("../admin/api/organization", () => ({
  fetchOrganizationProfile: vi.fn().mockResolvedValue({
    name: "Acme Motors",
    slug: "acme-motors",
    created_at: "2026-10-21T09:30:00Z",
    is_ready: true,
    owner: { name: "Asha Rao", email: "asha@acme.test" },
  }),
}));

vi.mock("../hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: [],
    readIds: new Set<string>(),
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  }),
}));

const mockFetchMe = vi.mocked(fetchMe);

/*
 * Stand-ins for the screens, so these tests are about the frame around them
 * (topbar and sidebar) and make no requests of their own.
 */
const screens = [
  { path: "dms/*", element: <p>DMS home</p> },
  { path: "admin", element: <p>Admin panel home</p> },
  { path: "admin/dealers", element: <p>Dealers screen</p> },
];

function sidebar() {
  return screen.getByRole("navigation", { name: "Admin panel navigation" });
}

beforeEach(() => {
  mockFetchMe.mockReset();
});

describe("the shield in the topbar", () => {
  it("opens the Admin panel, straight after the bell", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/dms", children: screens });

    const shield = await screen.findByRole("link", { name: "Admin panel" });
    expect(shield).toHaveAttribute("href", "/acme-motors/admin");
    const bell = screen.getByRole("button", { name: /^Notifications/ });
    expect(bell.nextElementSibling).toBe(shield);
  });

  it("names itself on focus", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/dms", children: screens });

    fireEvent.focus(await screen.findByRole("link", { name: "Admin panel" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Admin panel");
  });

  it("is not drawn for somebody who cannot open the Admin panel", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [salespersonMembership()] }));

    renderRoute({ path: "/acme-motors/dms", children: screens });

    await screen.findByText("DMS home");
    expect(screen.queryByRole("link", { name: "Admin panel" })).not.toBeInTheDocument();
  });

  it("is on the launcher too, which no longer has an Administration tile", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors" });

    await screen.findByRole("heading", { name: "Your apps" });
    expect(screen.getByRole("link", { name: "Admin panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /DMS/ })).toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Admin panel/ })).not.toBeInTheDocument();
  });

  it("shows where you are while the panel is open", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/dealers", children: screens });

    // Inside the panel the name block is ALSO a link called "Admin panel", so
    // the shield is found by its place: straight after the bell.
    const bell = await screen.findByRole("button", { name: /^Notifications/ });
    const shield = bell.nextElementSibling;
    expect(shield).toHaveAccessibleName("Admin panel");
    expect(shield).toHaveAttribute("aria-current", "page");
  });
});

/*
 * The real Admin panel routes, for the accordion: which page `/admin` lands
 * on and which links a person is given are both part of what is tested.
 * The pages used here are the "being built" ones, which make no requests.
 */
const withAdmin = [{ path: "admin/*", element: <AdminRoutes /> }];

function moduleRow(name: string) {
  return within(sidebar()).getByRole("button", { name });
}

function expanded() {
  return within(sidebar())
    .getAllByRole("button")
    // The sidebar's own Collapse button also says aria-expanded; it is not a module.
    .filter((button) => button.getAttribute("aria-expanded") === "true")
    .map((button) => button.textContent)
    .filter((name) => name !== "Collapse");
}

describe("the Admin panel's accordion", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  });

  it("lists the owner's modules, with Dashboard greyed out and not pressable", async () => {
    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });
    await screen.findByRole("heading", { name: "Acme Motors" });

    const rows = within(sidebar())
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(rows).toEqual(["Organization", "App Management", "User Management", "Collapse"]);

    const dashboard = within(sidebar()).getByText("Dashboard").closest("[aria-disabled]");
    expect(dashboard).toHaveAttribute("aria-disabled", "true");
    expect(dashboard).toHaveTextContent("Soon");
    expect(within(sidebar()).queryByRole("link", { name: /Dashboard/ })).not.toBeInTheDocument();
  });

  it("goes to Profile from the front door, with Organization open", async () => {
    renderRoute({ path: "/acme-motors/admin", children: withAdmin });

    expect(await screen.findByRole("heading", { name: "Acme Motors" })).toBeInTheDocument();
    expect(expanded()).toEqual(["Organization"]);
    expect(within(sidebar()).getByRole("link", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens the module of the page you are on, the first time", async () => {
    renderRoute({ path: "/acme-motors/admin/admins-and-roles", children: withAdmin });
    await screen.findByRole("heading", { name: "Admins and Roles" });

    expect(expanded()).toEqual(["User Management"]);
    const links = within(sidebar())
      .getAllByRole("link")
      .map((link) => link.textContent);
    // Admins and Roles is ONE sub-module (the owner, 2026-11-18).
    expect(links).toEqual(["Users", "Admins and Roles"]);
  });

  it("keeps one module open at a time", async () => {
    renderRoute({ path: "/acme-motors/admin/admins-and-roles", children: withAdmin });
    await screen.findByRole("heading", { name: "Admins and Roles" });

    fireEvent.click(moduleRow("App Management"));

    expect(expanded()).toEqual(["App Management"]);
    expect(within(sidebar()).getByRole("link", { name: "Applications" })).toBeInTheDocument();
    expect(within(sidebar()).queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("closes the open module when it is pressed again, leaving none open", async () => {
    renderRoute({ path: "/acme-motors/admin/admins-and-roles", children: withAdmin });
    await screen.findByRole("heading", { name: "Admins and Roles" });

    fireEvent.click(moduleRow("User Management"));

    expect(expanded()).toEqual([]);
    expect(within(sidebar()).queryAllByRole("link")).toEqual([]);
  });

  it("marks the module of the page you are on even while it is closed", async () => {
    renderRoute({ path: "/acme-motors/admin/admins-and-roles", children: withAdmin });
    await screen.findByRole("heading", { name: "Admins and Roles" });

    fireEvent.click(moduleRow("Organization"));

    expect(moduleRow("User Management")).toHaveAttribute("data-current");
    expect(moduleRow("Organization")).not.toHaveAttribute("data-current");
  });

  it("opens a page's module when you go to that page", async () => {
    const { router } = renderRoute({ path: "/acme-motors/admin/admins-and-roles", children: withAdmin });
    await screen.findByRole("heading", { name: "Admins and Roles" });
    fireEvent.click(moduleRow("App Management"));

    // As a button elsewhere would ("Manage access" sending you to a page).
    await act(() => router.navigate("/acme-motors/admin/profile"));

    await screen.findByRole("heading", { name: "Acme Motors" });
    expect(expanded()).toEqual(["Organization"]);
  });

  it("keeps what you opened across a refresh", async () => {
    const first = renderRoute({ path: "/acme-motors/admin/admins-and-roles", children: withAdmin });
    await screen.findByRole("heading", { name: "Admins and Roles" });
    fireEvent.click(moduleRow("App Management"));
    first.unmount();

    // The store writes to localStorage: that is what a real refresh reads.
    const saved = JSON.parse(window.localStorage.getItem("xpredict-ui") ?? "{}") as {
      state?: { openSettingsModule?: Record<string, string | null> };
    };
    expect(saved.state?.openSettingsModule).toEqual({ admin: "App Management" });

    renderRoute({ path: "/acme-motors/admin/admins-and-roles", children: withAdmin });
    await screen.findByRole("heading", { name: "Admins and Roles" });

    expect(expanded()).toEqual(["App Management"]);
  });

  it("keeps everything closed across a refresh, if that is how you left it", async () => {
    const first = renderRoute({ path: "/acme-motors/admin/admins-and-roles", children: withAdmin });
    await screen.findByRole("heading", { name: "Admins and Roles" });
    fireEvent.click(moduleRow("User Management"));
    first.unmount();

    renderRoute({ path: "/acme-motors/admin/admins-and-roles", children: withAdmin });
    await screen.findByRole("heading", { name: "Admins and Roles" });

    expect(expanded()).toEqual([]);
  });

  it("gives a dealer admin User Management with Users alone", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dealerAdminMembership()] }));

    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });
    await screen.findByRole("heading", { name: "Page not found" });

    const rows = within(sidebar())
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(rows).toEqual(["User Management", "Collapse"]);

    fireEvent.click(moduleRow("User Management"));
    const links = within(sidebar())
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links).toEqual(["Users"]);
  });
});

describe("the sidebar follows the section tree (C79)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
  });

  function holding(modules: AppModule[], permissions: string[]) {
    return me({
      memberships: [membership({ role: "member", apps: [appAccess("admin", { modules, permissions })] })],
    });
  }

  it("shows a sub-module whose tab is all they may see, under its module", async () => {
    mockFetchMe.mockResolvedValue(
      holding(
        [{ code: "user_management", sub_modules: [{ code: "admins_and_roles", tabs: ["role"] }] }],
        ["admin.role.view"],
      ),
    );

    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });
    await screen.findByRole("heading", { name: "Page not found" });

    const rows = within(sidebar())
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(rows).toEqual(["User Management", "Collapse"]);

    fireEvent.click(moduleRow("User Management"));
    const links = within(sidebar())
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links).toEqual(["Admins and Roles"]);
  });

  it("does not open Users for somebody whose tree lacks it", async () => {
    mockFetchMe.mockResolvedValue(
      holding([{ code: "app_management", sub_modules: [{ code: "application", tabs: [] }] }], [
        "admin.application.view",
        // Users' other actions without its view: still not Users (C79 rule 5).
        "admin.user.update",
      ]),
    );

    // A person's own address, not `/admin/users`: the harness mounts that one
    // straight onto the Users screen for other tests, outside the guard.
    renderRoute({ path: "/acme-motors/admin/users/ravi", children: withAdmin });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("keeps Dealers, which is not in the tree, behind its permission", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dealerAdminMembership()] }));

    renderRoute({ path: "/acme-motors/admin/dealers", children: withAdmin });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
