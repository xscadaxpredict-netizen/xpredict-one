/**
 * The app tile's Edit | Disable | Unassign (the owner, 2026-11-20, as Zoho's):
 * Admin panel -> Users -> a person -> Applications -> one app.
 *
 *   Edit      -- a dialog with the app's role, roles that fit where they sit.
 *   Disable   -- asks first; the tile then says "Disabled" and offers Enable.
 *   Unassign  -- asks first; the app goes.
 *
 * Each on its own permission. The owner's tiles and the Admin panel tile stay
 * greyed, and a pending person's app cannot be disabled.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import type * as usersApi from "../admin/api/users";
import { changeAppRole, fetchUsers, setAppStatus, unassignApp } from "../admin/api/users";
import { fetchRoles } from "../admin/api/roles";
import { UsersScreen } from "../admin/screens/UsersScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { ADMIN_PANEL_TREE, appAccess, me, membership, roleCatalogue, adminRoleFor } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
  changeAppRole: vi.fn(),
  setAppStatus: vi.fn(),
  unassignApp: vi.fn(),
}));

vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin/api/roles")>()),
  fetchRoles: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockChangeAppRole = vi.mocked(changeAppRole);
const mockSetAppStatus = vi.mocked(setAppStatus);
const mockUnassignApp = vi.mocked(unassignApp);
const mockFetchRoles = vi.mocked(fetchRoles);

const ALL_THREE = ["admin.user.edit_app", "admin.user.disable_app", "admin.user.unassign_app"];

/** An organisation admin holding exactly these Admin panel permissions. */
function adminWith(permissions: string[]) {
  return me({
    memberships: [
      membership({
        role: "admin",
        apps: [
          appAccess("dms"),
          appAccess("admin", {
            modules: ADMIN_PANEL_TREE,
            permissions: ["admin.user.view", ...permissions],
          }),
        ],
      }),
    ],
  });
}

function user(overrides: Partial<usersApi.OrgUser> & { id: string }): usersApi.OrgUser {
  return {
    first_name: "First",
    last_name: "Last",
    email: `${overrides.id}@acme.test`,
    unit_name: null,
    unit_id: null,
    role: "member",
    admin_role: adminRoleFor(overrides.role ?? "member"),
    status: "active",
    apps: [],
    administers: null,
    ...overrides,
  };
}

const DMS_GROUP_OPS: usersApi.UserAppRole = {
  app: "dms",
  role_code: "dms.group_operations",
  role_name: "Group operations",
  status: "active",
};

/** Organisation-wide, holding DMS. */
const RAVI = user({ id: "ravi", first_name: "Ravi", last_name: "Kumar", apps: [DMS_GROUP_OPS] });
/** At a dealership, holding DMS there. */
const DEEPA = user({
  id: "deepa",
  first_name: "Deepa",
  last_name: "Nair",
  unit_id: "unit-1",
  unit_name: "Chennai — Guindy",
  apps: [
    {
      app: "dms",
      role_code: "dms.sales_representative",
      role_name: "Sales representative",
      status: "active",
    },
  ],
});
/** DMS switched off. */
const SAM = user({
  id: "sam",
  first_name: "Sam",
  last_name: "Lee",
  apps: [{ ...DMS_GROUP_OPS, status: "disabled" }],
});
/** Invited, holding DMS on the invitation. */
const KIRAN = user({
  id: "kiran",
  first_name: "Kiran",
  last_name: "Bose",
  status: "invited",
  apps: [DMS_GROUP_OPS],
});
const OWNER = user({
  id: "owner",
  first_name: "Anita",
  last_name: "Rao",
  role: "owner",
  apps: [DMS_GROUP_OPS],
  administers: "organisation",
});

const routes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/users/:userId", element: <UsersScreen /> },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(adminWith(ALL_THREE));
  mockFetchUsers.mockResolvedValue([RAVI, DEEPA, SAM, KIRAN, OWNER]);
  mockFetchRoles.mockResolvedValue(roleCatalogue());
  mockChangeAppRole.mockResolvedValue(RAVI);
  mockSetAppStatus.mockResolvedValue(RAVI);
  mockUnassignApp.mockResolvedValue(RAVI);
});

async function openApplications(id: string, name: string) {
  renderRoute({ path: `/acme-motors/admin/users/${id}`, children: routes });
  const panel = await screen.findByRole("complementary", { name });
  fireEvent.click(within(panel).getByRole("tab", { name: "Applications" }));
  return panel;
}

function action(panel: HTMLElement, verb: string, target: string) {
  return within(panel).getByRole("button", { name: `${verb} ${target}` });
}

describe("the tile's actions", () => {
  it("are live for an admin holding the three permissions", async () => {
    const panel = await openApplications("ravi", "Ravi Kumar");

    for (const verb of ["Edit", "Disable", "Unassign"]) {
      expect(action(panel, verb, "DMS for Ravi Kumar")).not.toHaveAttribute("aria-disabled");
    }
  });

  it("leave Edit greyed for somebody who may only edit people's details", async () => {
    // `admin.user.update` is Edit user (name, email), not the role in an app.
    mockFetchMe.mockResolvedValue(adminWith(["admin.user.update"]));
    const panel = await openApplications("ravi", "Ravi Kumar");

    expect(action(panel, "Edit", "DMS for Ravi Kumar")).toHaveAttribute("aria-disabled", "true");
  });

  it("are greyed one by one without their permission", async () => {
    mockFetchMe.mockResolvedValue(adminWith(["admin.user.edit_app"]));
    const panel = await openApplications("ravi", "Ravi Kumar");

    expect(action(panel, "Edit", "DMS for Ravi Kumar")).not.toHaveAttribute("aria-disabled");
    expect(action(panel, "Disable", "DMS for Ravi Kumar")).toHaveAttribute("aria-disabled", "true");
    expect(action(panel, "Unassign", "DMS for Ravi Kumar")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("stay greyed on the owner's tiles: they hold every app by rule", async () => {
    const panel = await openApplications("owner", "Anita Rao");

    for (const verb of ["Edit", "Disable", "Unassign"]) {
      expect(action(panel, verb, "DMS for Anita Rao")).toHaveAttribute("aria-disabled", "true");
      expect(action(panel, verb, "Admin panel for Anita Rao")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });
});

describe("Edit", () => {
  it("opens on the role they hold and sends the new one", async () => {
    const panel = await openApplications("ravi", "Ravi Kumar");

    fireEvent.click(action(panel, "Edit", "DMS for Ravi Kumar"));
    const dialog = await screen.findByRole("dialog", { name: "Edit DMS" });
    const picker = await within(dialog).findByLabelText("Role in DMS");
    expect(picker).toHaveValue("dms.group_operations");

    fireEvent.change(picker, { target: { value: "dms.fleet_viewer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(mockChangeAppRole).toHaveBeenCalledWith(
        "acme-motors",
        "ravi",
        "dms",
        "dms.fleet_viewer",
      );
    });
  });

  it("offers dealership roles to somebody at a dealership, and only those", async () => {
    const panel = await openApplications("deepa", "Deepa Nair");

    fireEvent.click(action(panel, "Edit", "DMS for Deepa Nair"));
    const dialog = await screen.findByRole("dialog", { name: "Edit DMS" });
    const picker = await within(dialog).findByLabelText("Role in DMS");
    const offered = within(picker)
      .getAllByRole("option")
      .map((option) => option.getAttribute("value"));

    expect(offered).toContain("dms.manager");
    expect(offered).not.toContain("dms.group_operations");
  });
});

describe("Disable", () => {
  it("asks first, and Cancel sends nothing", async () => {
    const panel = await openApplications("ravi", "Ravi Kumar");

    fireEvent.click(action(panel, "Disable", "DMS for Ravi Kumar"));
    const dialog = await screen.findByRole("dialog", { name: "Disable DMS for Ravi Kumar" });
    expect(dialog).toHaveTextContent(
      "Are you sure you want to disable the application for this user?",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mockSetAppStatus).not.toHaveBeenCalled();
  });

  it("disables on Yes, Disable", async () => {
    const panel = await openApplications("ravi", "Ravi Kumar");

    fireEvent.click(action(panel, "Disable", "DMS for Ravi Kumar"));
    const dialog = await screen.findByRole("dialog", { name: "Disable DMS for Ravi Kumar" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, Disable" }));

    await waitFor(() => {
      expect(mockSetAppStatus).toHaveBeenCalledWith("acme-motors", "ravi", "dms", "disable");
    });
  });

  it("shows a disabled app as Disabled, and Enable switches it back without asking", async () => {
    const panel = await openApplications("sam", "Sam Lee");

    const tiles = within(panel).getByRole("list", { name: "Sam Lee's applications" });
    expect(within(tiles).getByText("Disabled")).toBeInTheDocument();

    fireEvent.click(action(panel, "Enable", "DMS for Sam Lee"));

    await waitFor(() => {
      expect(mockSetAppStatus).toHaveBeenCalledWith("acme-motors", "sam", "dms", "enable");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is greyed for somebody who has not joined: their apps open nothing yet", async () => {
    const panel = await openApplications("kiran", "Kiran Bose");

    expect(action(panel, "Disable", "DMS for Kiran Bose")).toHaveAttribute("aria-disabled", "true");
    expect(action(panel, "Unassign", "DMS for Kiran Bose")).not.toHaveAttribute("aria-disabled");
  });

  it("shows the server's refusal in the dialog, and stays open", async () => {
    mockSetAppStatus.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "The owner already holds every app.",
        code: "owner_holds_every_app",
        trace_id: "t-1",
      }),
    );
    const panel = await openApplications("ravi", "Ravi Kumar");

    fireEvent.click(action(panel, "Disable", "DMS for Ravi Kumar"));
    const dialog = await screen.findByRole("dialog", { name: "Disable DMS for Ravi Kumar" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, Disable" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The owner already holds every app.",
    );
    expect(screen.getByRole("dialog", { name: "Disable DMS for Ravi Kumar" })).toBeInTheDocument();
  });
});

describe("Unassign", () => {
  it("asks first, then removes the app", async () => {
    const panel = await openApplications("ravi", "Ravi Kumar");

    fireEvent.click(action(panel, "Unassign", "DMS for Ravi Kumar"));
    const dialog = await screen.findByRole("dialog", { name: "Unassign DMS for Ravi Kumar" });
    expect(dialog).toHaveTextContent("Are you sure you want to unassign the application?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, Unassign" }));

    await waitFor(() => {
      expect(mockUnassignApp).toHaveBeenCalledWith("acme-motors", "ravi", "dms");
    });
  });
});
