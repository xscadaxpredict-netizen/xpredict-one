/**
 * Applications -> an app -> ⋮ -> Assign users (the owner, 2026-11-20): pick
 * people who do not have the app yet, then one role for all of them, in one
 * request. From the row's ⋮ and from the side panel's -- one component.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import AdminRoutes from "../admin/routes";
import {
  assignUsersToApp,
  fetchApplicationMembers,
  fetchApplications,
  type Application,
} from "../admin/api/applications";
import type * as usersApi from "../admin/api/users";
import { fetchUsers } from "../admin/api/users";
import { fetchRoles } from "../admin/api/roles";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import { ADMIN_PANEL_TREE, appAccess, me, membership, ownerMembership, roleCatalogue } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/applications", () => ({
  fetchApplications: vi.fn(),
  fetchApplicationMembers: vi.fn(),
  assignUsersToApp: vi.fn(),
}));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
}));

vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin/api/roles")>()),
  fetchRoles: vi.fn(),
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
const mockAssign = vi.mocked(assignUsersToApp);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockFetchRoles = vi.mocked(fetchRoles);

const withAdmin = [{ path: "admin/*", element: <AdminRoutes /> }];
const OWNER = { name: "Asha Rao", email: "asha@acme.test" };
const APPS: Application[] = [
  { code: "dms", name: "DMS", active: true, members: 2, owner: OWNER },
  { code: "crm", name: "CRM", active: true, members: 1, owner: OWNER },
];

function user(overrides: Partial<usersApi.OrgUser> & { id: string }): usersApi.OrgUser {
  return {
    first_name: "First",
    last_name: "Last",
    email: `${overrides.id}@acme.test`,
    unit_name: null,
    unit_id: null,
    role: "member",
    status: "active",
    apps: [],
    administers: null,
    ...overrides,
  };
}

const DMS_HELD: usersApi.UserAppRole = {
  app: "dms",
  role_code: "dms.fleet_viewer",
  role_name: "Fleet viewer",
  status: "active",
};

const PEOPLE = [
  user({ id: "owner", first_name: "Asha", last_name: "Rao", role: "owner", apps: [DMS_HELD] }),
  user({ id: "ravi", first_name: "Ravi", last_name: "Kumar", apps: [DMS_HELD] }),
  user({ id: "meena", first_name: "Meena", last_name: "Iyer" }),
  user({ id: "kiran", first_name: "Kiran", last_name: "Bose", status: "invited" }),
  user({
    id: "deepa",
    first_name: "Deepa",
    last_name: "Nair",
    unit_id: "unit-1",
    unit_name: "Chennai — Guindy",
    apps: [{ ...DMS_HELD, role_code: "dms.manager", role_name: "Manager" }],
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchApps.mockResolvedValue(APPS);
  mockFetchMembers.mockResolvedValue([]);
  mockFetchUsers.mockResolvedValue(PEOPLE);
  mockFetchRoles.mockResolvedValue(roleCatalogue());
  mockAssign.mockResolvedValue(undefined);
});

/** Opens Assign users from the row's ⋮ on the Applications list. */
async function openFromRow(appName: string) {
  renderRoute({ path: "/acme-motors/admin/applications", children: withAdmin });
  await screen.findByRole("table");
  fireEvent.keyDown(screen.getByRole("button", { name: `More actions for ${appName}` }), {
    key: "Enter",
  });
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Assign users" }));
  return screen.findByRole("dialog", { name: "Assign users" });
}

function offered(dialog: HTMLElement) {
  const list = within(dialog).getByRole("list", { name: /People who can be given/ });
  return within(list)
    .getAllByRole("checkbox")
    .map((box) => box.closest("label")?.textContent ?? "");
}

describe("choosing people", () => {
  it("offers everybody who does not have the app yet, never the owner", async () => {
    const dialog = await openFromRow("DMS");

    await waitFor(() => {
      expect(offered(dialog)).toHaveLength(2);
    });
    const names = offered(dialog).join(" | ");
    expect(names).toContain("Meena Iyer");
    expect(names).toContain("Kiran Bose");
    // Ravi and Deepa hold DMS already; the owner holds every app by rule.
    expect(names).not.toContain("Ravi Kumar");
    expect(names).not.toContain("Asha Rao");
  });

  it("tags somebody who has not joined yet", async () => {
    const dialog = await openFromRow("DMS");

    const kiran = (await within(dialog).findByText("Kiran Bose")).closest("label");
    expect(kiran).toHaveTextContent("Pending");
  });

  it("greys out somebody at a dealership for an organisation-wide app, saying why (C27)", async () => {
    const dialog = await openFromRow("CRM");

    const deepa = (await within(dialog).findByText("Deepa Nair")).closest("label");
    expect(deepa).toHaveTextContent("Works at Chennai — Guindy");
    expect(within(deepa as HTMLElement).getByRole("checkbox")).toBeDisabled();
  });

  it("needs somebody chosen before Next", async () => {
    const dialog = await openFromRow("DMS");

    expect(within(dialog).getByRole("button", { name: "Next" })).toBeDisabled();
  });
});

describe("assigning", () => {
  it("sends everybody chosen with the one role", async () => {
    const dialog = await openFromRow("DMS");

    fireEvent.click(await within(dialog).findByRole("checkbox", { name: /Meena Iyer/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Kiran Bose/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Next (2)" }));

    const picker = await within(dialog).findByLabelText("Role in DMS");
    fireEvent.change(picker, { target: { value: "dms.fleet_viewer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign 2 users" }));

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith(
        "acme-motors",
        "dms",
        ["meena", "kiran"],
        "dms.fleet_viewer",
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("will not send without a role", async () => {
    const dialog = await openFromRow("DMS");

    fireEvent.click(await within(dialog).findByRole("checkbox", { name: /Meena Iyer/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Next (1)" }));
    await within(dialog).findByLabelText("Role in DMS");
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign 1 user" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Choose a role in DMS.");
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and keeps the dialog open", async () => {
    mockAssign.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "This person already has that app. Change their role from its tile instead.",
        code: "app_already_held",
        trace_id: "t-1",
      }),
    );
    const dialog = await openFromRow("DMS");

    fireEvent.click(await within(dialog).findByRole("checkbox", { name: /Meena Iyer/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Next (1)" }));
    fireEvent.change(await within(dialog).findByLabelText("Role in DMS"), {
      target: { value: "dms.fleet_viewer" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign 1 user" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This person already has that app.",
    );
  });
});

describe("where it is offered", () => {
  /*
   * The menu and the dialog are portals, and React bubbles their clicks up to
   * the row -- which opens the app's panel underneath. The actions cell stops
   * them.
   */
  it("does not open the app's panel from the row", async () => {
    const dialog = await openFromRow("DMS");

    fireEvent.click(await within(dialog).findByRole("checkbox", { name: /Meena Iyer/ }));
    // Let a navigation, if one was triggered, finish.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // The DOM, not roles: the open dialog hides the page behind it from
    // screen readers, so a role query would miss an opened row either way.
    expect(document.querySelector("tr[data-open]")).toBeNull();
  });

  it("is also in the side panel's ⋮", async () => {
    renderRoute({ path: "/acme-motors/admin/applications/dms", children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "DMS" });

    fireEvent.keyDown(within(panel).getByRole("button", { name: "More actions for DMS" }), {
      key: "Enter",
    });
    fireEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Assign users" }),
    );

    expect(await screen.findByRole("dialog", { name: "Assign users" })).toBeInTheDocument();
  });

  it("is greyed without admin.user.assign_app", async () => {
    mockFetchMe.mockResolvedValue(
      me({
        memberships: [
          membership({
            role: "admin",
            apps: [
              appAccess("dms"),
              appAccess("admin", {
                modules: ADMIN_PANEL_TREE,
                permissions: ["admin.application.view", "admin.user.view"],
              }),
            ],
          }),
        ],
      }),
    );
    renderRoute({ path: "/acme-motors/admin/applications", children: withAdmin });
    await screen.findByRole("table");

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for DMS" }), {
      key: "Enter",
    });

    expect(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Assign users" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
