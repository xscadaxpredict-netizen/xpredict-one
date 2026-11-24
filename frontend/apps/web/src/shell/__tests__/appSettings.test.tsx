/**
 * An app's own settings (C78), behind the gear in the topbar: DMS settings at
 * `/<org>/dms/settings`, with C82's two modules drawn as an accordion. The
 * owner's alone until the app-admin role is designed (the owner, 2026-11-23).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import DmsSettingsRoutes from "../../products/dms/app-settings/routes";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import {
  appAccess,
  dealerAdminMembership,
  me,
  membership,
  modulesOf,
  ownerMembership,
  salespersonMembership,
} from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

// Users is a real page now; its request is answered here so these tests stay
// about the gear, the sidebar and the guard.
vi.mock("../../products/dms/app-settings/api", () => ({
  fetchDmsUsers: vi.fn().mockResolvedValue([]),
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
 * The real DMS settings routes; the rest of DMS is a stand-in, so these tests
 * are about the gear, the sidebar and the guard, and make no requests.
 */
const screens = [
  { path: "dms/settings/*", element: <DmsSettingsRoutes /> },
  { path: "dms/*", element: <p>DMS home</p> },
  { path: "crm/*", element: <p>CRM home</p> },
  { path: "admin/*", element: <p>Admin panel home</p> },
];

function gear() {
  return screen.queryByRole("link", { name: "DMS settings" });
}

/** An organisation admin: everything the Admin panel offers, but not the owner. */
function orgAdminMembership() {
  return membership({
    role: "admin",
    apps: [
      appAccess("dms", { modules: modulesOf("sales", "service") }),
      appAccess("crm"),
      appAccess("ecommerce", { subscribed: false, accessible: false }),
      appAccess("admin"),
    ],
  });
}

beforeEach(() => {
  mockFetchMe.mockReset();
  window.localStorage.clear();
  // The accordion remembers the open module in this store, which outlives a
  // test; without the reset one test's choice leaks into the next.
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
});

describe("the gear in the topbar", () => {
  it("opens DMS settings for the owner, beside the bell on the app's side of the line", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/dms", children: screens });

    await screen.findByText("DMS home");
    const bell = screen.getByRole("button", { name: /^Notifications/ });
    const cog = gear()!;
    expect(cog).toHaveAttribute("href", "/acme-motors/dms/settings");
    // App level (the bell, the gear), then the line, then the organisation's
    // (the shield) -- the owner, 2026-11-23.
    expect(cog.parentElement!.contains(bell)).toBe(true);
    expect(cog.parentElement!.nextElementSibling).toHaveAttribute("aria-hidden", "true");
    const shield = screen.getByRole("link", { name: "Admin panel" });
    expect(cog.parentElement!.contains(shield)).toBe(false);
  });

  it("names the app's settings on focus", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/dms", children: screens });

    await screen.findByText("DMS home");
    fireEvent.focus(gear()!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("DMS settings");
  });

  it.each([
    ["an organisation admin", orgAdminMembership],
    ["a dealer admin", dealerAdminMembership],
    ["a salesperson", salespersonMembership],
  ])("is not drawn for %s -- the owner's alone for now", async (_who, makeMembership) => {
    mockFetchMe.mockResolvedValue(me({ memberships: [makeMembership()] }));

    renderRoute({ path: "/acme-motors/dms", children: screens });

    await screen.findByText("DMS home");
    expect(gear()).not.toBeInTheDocument();
  });

  it("is not on the launcher, which is no app", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors" });

    await screen.findByRole("heading", { name: "Your apps" });
    expect(screen.queryByRole("link", { name: /settings/ })).not.toBeInTheDocument();
  });

  it("is not in an app without settings, nor in the Admin panel", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    const { router } = renderRoute({ path: "/acme-motors/crm", children: screens });
    await screen.findByText("CRM home");
    expect(screen.queryByRole("link", { name: /settings/ })).not.toBeInTheDocument();

    await router.navigate("/acme-motors/admin");
    await screen.findByText("Admin panel home");
    expect(screen.queryByRole("link", { name: /settings/ })).not.toBeInTheDocument();
  });

  it("shows where you are while DMS settings are open", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/dms/settings/roles", children: screens });

    await screen.findByRole("heading", { name: "Roles" });
    expect(gear()).toHaveAttribute("aria-current", "page");
  });
});

describe("DMS settings", () => {
  function settingsSidebar() {
    return screen.getByRole("navigation", { name: "DMS settings navigation" });
  }

  it("lands on Users, under Users & Roles, with the two modules in the sidebar", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    const { router } = renderRoute({ path: "/acme-motors/dms/settings", children: screens });

    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/acme-motors/dms/settings/users");

    const sidebar = settingsSidebar();
    expect(within(sidebar).getByRole("button", { name: "Users & Roles" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(sidebar).getByRole("link", { name: "Roles" })).toHaveAttribute(
      "href",
      "/acme-motors/dms/settings/roles",
    );
    // DMS's own links give way to the settings modules here.
    expect(screen.queryByRole("navigation", { name: "DMS navigation" })).not.toBeInTheDocument();
  });

  it("opens Security & Controls on its pages", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    // Position Hierarchy: still drawn only. (Territory Management is built --
    // `dmsTerritories.test.tsx`.)
    renderRoute({ path: "/acme-motors/dms/settings/position-hierarchy", children: screens });

    expect(await screen.findByRole("heading", { name: "Position Hierarchy" })).toBeInTheDocument();
    const sidebar = settingsSidebar();
    expect(within(sidebar).getByRole("button", { name: "Security & Controls" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(sidebar).getByRole("link", { name: "Territory Management" })).toHaveAttribute(
      "href",
      "/acme-motors/dms/settings/territories",
    );
  });

  it("is not found for anybody but the owner, even by its address", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [orgAdminMembership()] }));

    renderRoute({ path: "/acme-motors/dms/settings/users", children: screens });

    expect(await screen.findByRole("heading", { name: /not found/i })).toBeInTheDocument();
    expect(screen.queryByText("This page is being built.")).not.toBeInTheDocument();
  });

  it("is not found at an address it does not have", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/dms/settings/nonsense", children: screens });

    expect(await screen.findByRole("heading", { name: /not found/i })).toBeInTheDocument();
  });
});
