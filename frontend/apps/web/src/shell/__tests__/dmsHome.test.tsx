/**
 * DMS -> Home (the owner, 2026-11-25): one page, two tabs. Dashboard holds the
 * dashboard and nothing else; Getting Started holds the rest of what the
 * Welcome Hub showed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import DmsRoutes from "../../products/dms/routes";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
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

// The dashboard's panels each fetch their numbers; these tests are about the
// page around them.
vi.mock("../../products/dms/screens/ConsolidatedDashboard", () => ({
  ConsolidatedDashboard: () => <p>The dashboard panels</p>,
}));

const screens = [{ path: "dms/*", element: <DmsRoutes /> }];

beforeEach(() => {
  vi.mocked(fetchMe).mockResolvedValue(me({ memberships: [ownerMembership()] }));
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
});

describe("DMS Home", () => {
  it("opens on the Dashboard tab from DMS's own address, with only the dashboard", async () => {
    const { router } = renderRoute({ path: "/acme-motors/dms", children: screens });

    expect(await screen.findByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/acme-motors/dms/home");
    expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Getting Started" })).toHaveAttribute(
      "href",
      "/acme-motors/dms/home/getting-started",
    );
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("The dashboard panels")).toBeInTheDocument();
    expect(within(panel).queryByText(/Welcome to Dealer Management System/)).not.toBeInTheDocument();
    // The sidebar's Home link counts as "here".
    const sidebar = screen.getByRole("navigation", { name: "DMS navigation" });
    expect(within(sidebar).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the welcome, the stages and the modules on Getting Started", async () => {
    renderRoute({ path: "/acme-motors/dms/home/getting-started", children: screens });

    expect(await screen.findByRole("tab", { name: "Getting Started" })).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(/Welcome to Dealer Management System/)).toBeInTheDocument();
    expect(within(panel).getByText("Enquiries & Sales")).toBeInTheDocument();
    expect(within(panel).queryByText("The dashboard panels")).not.toBeInTheDocument();
    // The old banner of claims is gone.
    expect(within(panel).queryByText("Process Coverage")).not.toBeInTheDocument();
    // The Home link stays "here" on its second tab.
    const sidebar = screen.getByRole("navigation", { name: "DMS navigation" });
    expect(within(sidebar).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });

  it("sends the Welcome Hub's old address, with its filter, to Home", async () => {
    const { router } = renderRoute({ path: "/acme-motors/dms/welcome?view=sales", children: screens });

    await screen.findByRole("heading", { level: 1, name: "Home" });
    expect(router.state.location.pathname).toBe("/acme-motors/dms/home");
    expect(router.state.location.search).toBe("?view=sales");
  });
});
