/**
 * Admin panel -> App Management -> Applications (C78): an active/inactive/all
 * filter, a list of app name, owner and members, and the TOPBAR's search box
 * searching it while the page is open.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import AdminRoutes from "../admin/routes";
import {
  fetchApplicationMembers,
  fetchApplications,
  type Application,
  type ApplicationMember,
} from "../admin/api/applications";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import {
  ADMIN_PANEL_TREE,
  appAccess,
  dealerAdminMembership,
  me,
  membership,
  ownerMembership,
} from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/applications", () => ({
  fetchApplications: vi.fn(),
  fetchApplicationMembers: vi.fn(),
}));

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
const mockFetchApps = vi.mocked(fetchApplications);
const mockFetchMembers = vi.mocked(fetchApplicationMembers);

const CRM_PEOPLE: ApplicationMember[] = [
  {
    id: "m-1",
    name: "Asha Rao",
    email: "asha@acme.test",
    is_owner: true,
    role: null,
    places: [],
  },
  {
    id: "m-2",
    name: "Nishanth S",
    email: "nishanth@acme.test",
    is_owner: false,
    role: "Regional sales manager",
    places: ["Sales 2"],
  },
  {
    id: "m-3",
    name: "ravi@acme.test",
    email: "ravi@acme.test",
    is_owner: false,
    role: "Member",
    places: ["Delhi East", "Delhi West"],
  },
];

const withAdmin = [{ path: "admin/*", element: <AdminRoutes /> }];
const OWNER = { name: "Asha Rao", email: "asha@acme.test" };

const APPS: Application[] = [
  { code: "dms", name: "DMS", active: true, members: 24, owner: OWNER },
  { code: "crm", name: "CRM", active: true, members: 6, owner: OWNER },
  { code: "ecommerce", name: "E-commerce", active: false, members: 0, owner: null },
];

function rowNames() {
  return screen
    .queryAllByRole("rowheader")
    .map((cell) => within(cell).getByText(/^(DMS|CRM|E-commerce)$/).textContent);
}

function topbarSearch() {
  return screen.getByRole("searchbox", { name: "Search" });
}

async function openPage() {
  renderRoute({ path: "/acme-motors/admin/applications", children: withAdmin });
  await screen.findByRole("heading", { name: "Applications" });
  await screen.findByRole("table");
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchApps.mockResolvedValue(APPS);
  mockFetchMembers.mockResolvedValue(CRM_PEOPLE);
});

describe("the list", () => {
  it("shows the active apps first, with owner and members", async () => {
    await openPage();

    expect(rowNames()).toEqual(["DMS", "CRM"]);
    expect(screen.getByText("2 apps")).toBeInTheDocument();

    const dms = screen.getByRole("row", { name: /DMS/ });
    expect(within(dms).getByText("Asha Rao")).toBeInTheDocument();
    expect(within(dms).getByText("asha@acme.test")).toBeInTheDocument();
    expect(within(dms).getByText("24")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "App name",
      "Owner",
      "Members",
      "Actions",
    ]);
  });

  it("filters to inactive apps, which have no owner and no members", async () => {
    await openPage();

    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), {
      target: { value: "inactive" },
    });

    expect(rowNames()).toEqual(["E-commerce"]);
    const row = screen.getByRole("row", { name: /E-commerce/ });
    expect(within(row).getByText("Not subscribed")).toBeInTheDocument();
    expect(within(row).getByLabelText("No owner")).toBeInTheDocument();
    expect(within(row).getByText("0")).toBeInTheDocument();
  });

  it("shows every app under All apps", async () => {
    await openPage();

    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), {
      target: { value: "all" },
    });

    expect(rowNames()).toEqual(["DMS", "CRM", "E-commerce"]);
    expect(screen.getByText("3 apps")).toBeInTheDocument();
  });

  it("says so when it cannot load", async () => {
    mockFetchApps.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Internal error",
        status: 500,
        detail: "Something went wrong.",
        code: "internal_error",
        trace_id: "trace-1",
      }),
    );

    renderRoute({ path: "/acme-motors/admin/applications", children: withAdmin });

    expect(await screen.findByText("Could not load applications")).toBeInTheDocument();
  });
});

describe("the ⋮ on every row", () => {
  it("is on every row, named for its app", async () => {
    await openPage();
    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), {
      target: { value: "all" },
    });

    for (const name of ["DMS", "CRM", "E-commerce"]) {
      const row = screen.getByRole("row", { name: new RegExp(name) });
      expect(
        within(row).getByRole("button", { name: `More actions for ${name}` }),
      ).toBeInTheDocument();
    }
  });

  it("offers Assign users on an active app", async () => {
    await openPage();

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for DMS" }), {
      key: "Enter",
    });

    const menu = await screen.findByRole("menu");
    const item = within(menu).getByRole("menuitem", { name: "Assign users" });
    expect(item).not.toHaveAttribute("aria-disabled");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
  });

  it("does not let you assign users to an app you do not subscribe to", async () => {
    await openPage();
    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), {
      target: { value: "inactive" },
    });

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for E-commerce" }), {
      key: "Enter",
    });

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Assign users" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("the topbar search", () => {
  it("becomes this page's search", async () => {
    await openPage();

    expect(topbarSearch()).toHaveAttribute("placeholder", "Search applications");
    // No second search box on the page itself.
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
  });

  it("filters the list as you type, by name or description", async () => {
    await openPage();

    fireEvent.change(topbarSearch(), { target: { value: "crm" } });
    expect(rowNames()).toEqual(["CRM"]);

    fireEvent.change(topbarSearch(), { target: { value: "dealership" } });
    expect(rowNames()).toEqual(["DMS"]);
  });

  it("says so when nothing matches", async () => {
    await openPage();

    fireEvent.change(topbarSearch(), { target: { value: "payroll" } });

    expect(rowNames()).toEqual([]);
    expect(screen.getByText("No active apps match “payroll”.")).toBeInTheDocument();
  });

  it("goes back to an ordinary search, and empties, on another page", async () => {
    const { router } = renderRoute({
      path: "/acme-motors/admin/applications",
      children: withAdmin,
    });
    await screen.findByRole("table");
    fireEvent.change(topbarSearch(), { target: { value: "crm" } });

    await act(() => router.navigate("/acme-motors/admin/profile"));
    await screen.findByRole("heading", { name: "Acme Motors" });

    expect(topbarSearch()).toHaveAttribute("placeholder", "Search…");
    expect(topbarSearch()).toHaveValue("");

    // And coming back starts afresh: the old search did not wait for you.
    await act(() => router.navigate("/acme-motors/admin/applications"));
    await screen.findByRole("table");
    expect(topbarSearch()).toHaveValue("");
    expect(rowNames()).toEqual(["DMS", "CRM"]);
  });
});

describe("who sees it", () => {
  it("is not offered to a dealer admin, and its address is not found", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dealerAdminMembership()] }));

    renderRoute({ path: "/acme-motors/admin/applications", children: withAdmin });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Admin panel navigation" });
    expect(within(nav).queryByRole("button", { name: "App Management" })).not.toBeInTheDocument();
    expect(mockFetchApps).not.toHaveBeenCalled();
  });
});


describe("an app opened beside the list", () => {
  function panel(name = "CRM") {
    return screen.getByRole("complementary", { name });
  }

  it("opens when its row is clicked, and the address says which", async () => {
    const { router } = renderRoute({
      path: "/acme-motors/admin/applications",
      children: withAdmin,
    });
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("row", { name: /CRM/ }));

    await screen.findByRole("complementary", { name: "CRM" });
    expect(router.state.location.pathname).toBe("/acme-motors/admin/applications/crm");
    expect(within(panel()).getByRole("heading", { name: "CRM" })).toBeInTheDocument();
    expect(within(panel()).getByText("Leads & marketing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CRM" })).toHaveAttribute("aria-current", "page");
  });

  it("opens straight from its address, as after a refresh", async () => {
    renderRoute({ path: "/acme-motors/admin/applications/crm", children: withAdmin });

    expect(await screen.findByRole("complementary", { name: "CRM" })).toBeInTheDocument();
    expect(mockFetchMembers).toHaveBeenCalledWith("acme-motors", "crm");
  });

  it("has Members working and Conditional Assignment greyed out", async () => {
    renderRoute({ path: "/acme-motors/admin/applications/crm", children: withAdmin });
    await screen.findByRole("complementary", { name: "CRM" });

    const tabs = within(panel()).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Members", "Conditional Assignment"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-disabled", "true");
  });

  it("lists who can open it, the owner first, with role and place", async () => {
    renderRoute({ path: "/acme-motors/admin/applications/crm", children: withAdmin });
    const list = await within(
      await screen.findByRole("complementary", { name: "CRM" }),
    ).findByRole("list", { name: "CRM members" });

    const people = within(list).getAllByRole("listitem");
    expect(people).toHaveLength(3);
    expect(within(people[0]!).getByText("Owner")).toBeInTheDocument();
    expect(within(people[1]!).getByText("Nishanth S")).toBeInTheDocument();
    expect(within(people[1]!).getByText("nishanth@acme.test")).toBeInTheDocument();
    expect(within(people[1]!).getByText("Regional sales manager, Sales 2")).toBeInTheDocument();
    expect(within(people[2]!).getByText("Member, Delhi East, Delhi West")).toBeInTheDocument();
    // A person with no name is shown by their address, once.
    expect(within(people[2]!).getAllByText("ravi@acme.test")).toHaveLength(1);
    expect(within(panel()).getByText("3 members")).toBeInTheDocument();
  });

  it("draws Edit, Disable and Unassign under everyone, all greyed out", async () => {
    renderRoute({ path: "/acme-motors/admin/applications/crm", children: withAdmin });
    const list = await screen.findByRole("list", { name: "CRM members" });

    for (const person of within(list).getAllByRole("listitem")) {
      const actions = within(person).getAllByRole("button");
      expect(actions.map((button) => button.textContent)).toEqual(["Edit", "Disable", "Unassign"]);
      for (const button of actions) {
        expect(button).toHaveAttribute("aria-disabled", "true");
      }
    }
    expect(within(list).getByRole("button", { name: "Unassign Nishanth S" })).toBeInTheDocument();
  });

  it("searches its members", async () => {
    renderRoute({ path: "/acme-motors/admin/applications/crm", children: withAdmin });
    await screen.findByRole("list", { name: "CRM members" });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search CRM members" }), {
      target: { value: "nish" },
    });
    expect(within(panel()).getAllByRole("listitem")).toHaveLength(1);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search CRM members" }), {
      target: { value: "payroll" },
    });
    expect(within(panel()).getByText("Nobody matches “payroll”.")).toBeInTheDocument();
  });

  it("says an unsubscribed app opens for nobody, without asking the server", async () => {
    renderRoute({ path: "/acme-motors/admin/applications/ecommerce", children: withAdmin });

    await screen.findByRole("complementary", { name: "E-commerce" });
    expect(within(panel("E-commerce")).getByText(/doesn.t subscribe to E-commerce/)).toBeInTheDocument();
    expect(mockFetchMembers).not.toHaveBeenCalled();
  });

  it("closes back to the list", async () => {
    const { router } = renderRoute({
      path: "/acme-motors/admin/applications/crm",
      children: withAdmin,
    });
    await screen.findByRole("complementary", { name: "CRM" });

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

    expect(router.state.location.pathname).toBe("/acme-motors/admin/applications");
    expect(screen.queryByRole("complementary", { name: "CRM" })).not.toBeInTheDocument();
  });

  it("stays open while the list is searched", async () => {
    renderRoute({ path: "/acme-motors/admin/applications/crm", children: withAdmin });
    await screen.findByRole("complementary", { name: "CRM" });

    fireEvent.change(topbarSearch(), { target: { value: "dms" } });

    expect(rowNames()).toEqual(["DMS"]);
    expect(screen.getByRole("complementary", { name: "CRM" })).toBeInTheDocument();
  });

  it("is not opened by the row's ⋮", async () => {
    const { router } = renderRoute({
      path: "/acme-motors/admin/applications",
      children: withAdmin,
    });
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "More actions for CRM" }));

    expect(router.state.location.pathname).toBe("/acme-motors/admin/applications");
  });

  it("says so when the address names an app not on the list", async () => {
    renderRoute({ path: "/acme-motors/admin/applications/payroll", children: withAdmin });

    expect(await screen.findByText(/That application isn.t on this list/)).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});

describe("the panel's tabs follow their permissions (C79)", () => {
  function holding(permissions: string[]) {
    return me({
      memberships: [
        membership({
          role: "member",
          apps: [
            appAccess("admin", {
              modules: ADMIN_PANEL_TREE,
              permissions: ["admin.application.view", ...permissions],
            }),
          ],
        }),
      ],
    });
  }

  it("hides Members, and never asks for them, without view_users", async () => {
    mockFetchMe.mockResolvedValue(holding(["admin.application.view_conditional_assignment"]));

    renderRoute({ path: "/acme-motors/admin/applications/crm", children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "CRM" });

    expect(within(panel).queryByRole("tab", { name: "Members" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("tab", { name: "Conditional Assignment" })).toBeInTheDocument();
    expect(mockFetchMembers).not.toHaveBeenCalled();
  });

  it("hides Conditional Assignment without its permission", async () => {
    mockFetchMe.mockResolvedValue(holding(["admin.application.view_users"]));

    renderRoute({ path: "/acme-motors/admin/applications/crm", children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "CRM" });

    expect(within(panel).getByRole("tab", { name: "Members" })).toBeInTheDocument();
    expect(
      within(panel).queryByRole("tab", { name: "Conditional Assignment" }),
    ).not.toBeInTheDocument();
  });
});
