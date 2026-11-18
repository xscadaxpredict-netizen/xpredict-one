/**
 * Admin panel -> Organization -> Profile (C78): read-only, only what the
 * platform stores, and only "Organization Info" of its tabs works.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import AdminRoutes from "../admin/routes";
import { fetchOrganizationProfile, type OrganizationProfile } from "../admin/api/organization";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import { dealerAdminMembership, me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/organization", () => ({
  fetchOrganizationProfile: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchProfile = vi.mocked(fetchOrganizationProfile);

const withAdmin = [{ path: "admin/*", element: <AdminRoutes /> }];

function profile(overrides: Partial<OrganizationProfile> = {}): OrganizationProfile {
  return {
    name: "Acme Motors",
    slug: "acme-motors",
    created_at: "2026-10-21T09:30:00Z",
    is_ready: true,
    owner: { name: "Asha Rao", email: "asha@acme.test" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchProfile.mockResolvedValue(profile());
});

describe("Organization Info", () => {
  it("shows the name, web address, owner, created date and workspace", async () => {
    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });

    expect(await screen.findByRole("heading", { name: "Acme Motors" })).toBeInTheDocument();
    expect(screen.getByText(`${window.location.host}/acme-motors`)).toBeInTheDocument();

    const details = screen.getByRole("region", { name: "Organization details" });
    expect(within(details).getByText("Asha Rao")).toBeInTheDocument();
    expect(within(details).getByText("asha@acme.test")).toBeInTheDocument();
    expect(within(details).getByText("21 October 2026")).toBeInTheDocument();
    expect(within(details).getByText("Ready")).toBeInTheDocument();
    expect(mockFetchProfile).toHaveBeenCalledWith("acme-motors");
  });

  it("says when the workspace is still being set up", async () => {
    mockFetchProfile.mockResolvedValue(profile({ is_ready: false }));

    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });

    expect(await screen.findByText("Being set up")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });

  it("shows an owner with no name by their address, once", async () => {
    mockFetchProfile.mockResolvedValue(
      profile({ owner: { name: "asha@acme.test", email: "asha@acme.test" } }),
    );

    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });

    await screen.findByRole("heading", { name: "Acme Motors" });
    expect(screen.getAllByText("asha@acme.test")).toHaveLength(1);
  });

  it("has nothing to edit: no Edit button, no logo, no form", async () => {
    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });

    await screen.findByRole("heading", { name: "Acme Motors" });
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("says so when the profile cannot be loaded", async () => {
    mockFetchProfile.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Internal error",
        status: 500,
        detail: "Something went wrong.",
        code: "internal_error",
        trace_id: "trace-1",
      }),
    );

    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });

    expect(await screen.findByText(/Could not load the organization's profile/)).toBeInTheDocument();
  });
});

describe("the tabs", () => {
  it("open on Organization Info, with the others greyed out", async () => {
    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });
    await screen.findByRole("heading", { name: "Acme Motors" });

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Organization Info",
      "Work Locations",
      "Designations",
      "Business Hours",
      "Holidays",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).not.toHaveAttribute("aria-disabled");
    for (const tab of tabs.slice(1)) {
      expect(tab).toHaveAttribute("aria-disabled", "true");
      expect(tab).toHaveAttribute("aria-selected", "false");
    }
  });
});

describe("who sees it", () => {
  it("is not offered to a dealer admin, and its address is not found", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dealerAdminMembership()] }));

    renderRoute({ path: "/acme-motors/admin/profile", children: withAdmin });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Admin panel navigation" });
    expect(within(nav).queryByRole("button", { name: "Organization" })).not.toBeInTheDocument();
    // Never asked: the screen was not registered for them at all.
    expect(mockFetchProfile).not.toHaveBeenCalled();
  });
});
