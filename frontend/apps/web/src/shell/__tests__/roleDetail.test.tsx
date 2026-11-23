/**
 * A role opened beside the Roles tab (the owner, 2026-11-20, from Zoho's):
 * a custom role's ⋮ (Clone, Edit, Delete) on its row, a side panel with
 * Permissions and Users, and the panel's own ⋮ (Assign Users, Edit, Clone,
 * Delete). Edit Role and Delete Role work on `admin.role.update` / `delete`;
 * Clone Role and Assign Users are still drawn only.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import AdminRoutes from "../admin/routes";
import type * as adminsApi from "../admin/api/admins";
import { fetchAdmins } from "../admin/api/admins";
import type * as rolesApi from "../admin/api/roles";
import {
  deletePanelRole,
  fetchPanelRoles,
  fetchRoleBuilder,
  updatePanelRole,
} from "../admin/api/roles";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import { ADMIN_PANEL_TREE, appAccess, me, membership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof rolesApi>()),
  fetchPanelRoles: vi.fn(),
  fetchRoleBuilder: vi.fn(),
  updatePanelRole: vi.fn(),
  deletePanelRole: vi.fn(),
}));

vi.mock("../admin/api/admins", async (importOriginal) => ({
  ...(await importOriginal<typeof adminsApi>()),
  fetchAdmins: vi.fn(),
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
const mockPanelRoles = vi.mocked(fetchPanelRoles);
const mockBuilder = vi.mocked(fetchRoleBuilder);
const mockAdmins = vi.mocked(fetchAdmins);
const mockUpdate = vi.mocked(updatePanelRole);
const mockDelete = vi.mocked(deletePanelRole);

const withAdmin = [{ path: "admin/*", element: <AdminRoutes /> }];
const ROLES = "/acme-motors/admin/admins-and-roles/roles";

const OWNER: rolesApi.PanelRole = {
  code: "owner",
  name: "Organization Owner",
  summary: "Every permission, by rule.",
  built_in: true,
  users: 1,
  modified_by: null,
};
const ORG_ADMIN: rolesApi.PanelRole = {
  code: "admin.org_admin",
  name: "Organization Admin",
  summary: "Runs the organisation.",
  built_in: true,
  users: 1,
  modified_by: null,
};
const CUSTOM: rolesApi.PanelRole = {
  code: "admin.custom_abc",
  name: "AU Admin",
  summary: "",
  built_in: false,
  users: 0,
  modified_by: "Anita Fernandes",
};

const BUILDER: rolesApi.RoleBuilder = {
  modules: [
    {
      code: "user_management",
      name: "User Management",
      rows: [
        {
          code: "user",
          name: "Users",
          actions: [
            { code: "view", name: "View", kind: "basic", permission: "admin.user.view" },
            { code: "create", name: "Create", kind: "basic", permission: "admin.user.create" },
            { code: "assign_app", name: "Assign app", kind: "special", permission: "admin.user.assign_app" },
          ],
        },
      ],
    },
  ],
  templates: [
    { code: "admin.org_admin", name: "Organization Admin", permissions: ["admin.user.view"] },
    { code: "admin.custom_abc", name: "AU Admin", permissions: ["admin.user.view", "admin.user.assign_app"] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
  mockFetchMe.mockResolvedValue(
    me({
      memberships: [
        membership({
          role: "admin",
          apps: [
            appAccess("dms"),
            appAccess("admin", {
              modules: ADMIN_PANEL_TREE,
              permissions: ["admin.role.view", "admin.role.create", "admin.admin.view"],
            }),
          ],
        }),
      ],
    }),
  );
  mockPanelRoles.mockResolvedValue([OWNER, ORG_ADMIN, CUSTOM]);
  mockBuilder.mockResolvedValue(BUILDER);
  mockAdmins.mockResolvedValue([
    { id: "m-1", first_name: "Asha", last_name: "Rao", email: "asha@acme.test", role: "owner", status: "active", apps_managed: [] },
    { id: "m-2", first_name: "Ravi", last_name: "Kumar", email: "ravi@acme.test", role: "admin", status: "active", apps_managed: [] },
  ]);
});

async function openMenu(button: HTMLElement) {
  fireEvent.keyDown(button, { key: "Enter" });
  return screen.findByRole("menu");
}

async function openRole(code: string, name: string) {
  renderRoute({ path: `${ROLES}/${code}`, children: withAdmin });
  return screen.findByRole("complementary", { name });
}

describe("the custom role's ⋮ on its row", () => {
  it("offers Clone, Edit and Delete, all greyed without update and delete", async () => {
    renderRoute({ path: ROLES, children: withAdmin });

    const row = await screen.findByRole("row", { name: /AU Admin/ });
    const menu = await openMenu(within(row).getByRole("button", { name: "More actions for AU Admin" }));

    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Clone Role", "Edit Role", "Delete Role"]);
    for (const item of items) expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("is not on a built-in role: they cannot be changed", async () => {
    renderRoute({ path: ROLES, children: withAdmin });

    const row = await screen.findByRole("row", { name: /Organization Admin/ });

    expect(within(row).queryByRole("button", { name: /More actions/ })).toBeNull();
  });
});

describe("a role opened beside the list", () => {
  it("opens from its row, with Permissions and Users", async () => {
    renderRoute({ path: ROLES, children: withAdmin });

    fireEvent.click(await screen.findByRole("link", { name: "AU Admin" }));

    const panel = await screen.findByRole("complementary", { name: "AU Admin" });
    expect(within(panel).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Permissions",
      "Users",
    ]);
  });

  it("shows what the role holds, page by page", async () => {
    const panel = await openRole("admin.custom_abc", "AU Admin");

    expect(await within(panel).findByLabelText("View: held")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Assign app: held")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Create: not held")).toBeInTheDocument();
  });

  it("offers Add Description when the role has none", async () => {
    const panel = await openRole("admin.custom_abc", "AU Admin");

    expect(within(panel).getByRole("button", { name: "Add Description" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("has a ⋮ for a custom role: Assign Users, Edit, Clone, Delete -- greyed without the rights", async () => {
    const panel = await openRole("admin.custom_abc", "AU Admin");

    const menu = await openMenu(
      within(panel).getByRole("button", { name: "More actions for AU Admin" }),
    );

    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Assign Users",
      "Edit Role",
      "Clone Role",
      "Delete Role",
    ]);
    for (const item of items) expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("has no ⋮ for a built-in role", async () => {
    const panel = await openRole("admin.org_admin", "Organization Admin");

    expect(within(panel).queryByRole("button", { name: /More actions/ })).toBeNull();
  });

  it("says nobody holds a custom role yet", async () => {
    const panel = await openRole("admin.custom_abc", "AU Admin");

    fireEvent.click(within(panel).getByRole("tab", { name: "Users" }));

    expect(within(panel).getByText(/Nobody has this role yet/)).toBeInTheDocument();
  });

  it("lists the organisation admins under Organization Admin", async () => {
    const panel = await openRole("admin.org_admin", "Organization Admin");

    fireEvent.click(within(panel).getByRole("tab", { name: "Users" }));

    const people = await within(panel).findByRole("list", { name: "People with Organization Admin" });
    expect(within(people).getByText("Ravi Kumar")).toBeInTheDocument();
    expect(within(people).queryByText("Asha Rao")).toBeNull();
  });

  it("states the owner's rule instead of a list", async () => {
    const panel = await openRole("owner", "Organization Owner");

    expect(within(panel).getByText(/holds every permission by rule/)).toBeInTheDocument();
  });

  it("says so for a role that is not there", async () => {
    renderRoute({ path: `${ROLES}/admin.custom_gone`, children: withAdmin });

    expect(await screen.findByText(/That role is not in/)).toBeInTheDocument();
  });
});

/** Somebody who may also change and delete roles (Organisation admin holds both). */
function mayChangeRoles() {
  mockFetchMe.mockResolvedValue(
    me({
      memberships: [
        membership({
          role: "admin",
          apps: [
            appAccess("dms"),
            appAccess("admin", {
              modules: ADMIN_PANEL_TREE,
              permissions: [
                "admin.role.view",
                "admin.role.create",
                "admin.role.update",
                "admin.role.delete",
                "admin.admin.view",
              ],
            }),
          ],
        }),
      ],
    }),
  );
}

function item(menu: HTMLElement, name: string) {
  return within(menu).getByRole("menuitem", { name });
}

describe("Edit Role and Delete Role", () => {
  beforeEach(mayChangeRoles);

  it("are live with the rights; Clone and Assign Users stay greyed", async () => {
    const panel = await openRole("admin.custom_abc", "AU Admin");

    const menu = await openMenu(
      within(panel).getByRole("button", { name: "More actions for AU Admin" }),
    );

    expect(item(menu, "Edit Role")).not.toHaveAttribute("aria-disabled");
    expect(item(menu, "Delete Role")).not.toHaveAttribute("aria-disabled");
    expect(item(menu, "Clone Role")).toHaveAttribute("aria-disabled", "true");
    expect(item(menu, "Assign Users")).toHaveAttribute("aria-disabled", "true");
  });

  it("Edit Role opens New Role's page filled in, without Copy permissions from", async () => {
    const panel = await openRole("admin.custom_abc", "AU Admin");
    const menu = await openMenu(
      within(panel).getByRole("button", { name: "More actions for AU Admin" }),
    );

    fireEvent.click(item(menu, "Edit Role"));

    expect(await screen.findByRole("heading", { name: "Edit Role" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Role name/)).toHaveValue("AU Admin");
    expect(screen.queryByLabelText("Copy permissions from")).toBeNull();
    expect(await screen.findByLabelText("View Users")).toBeChecked();
    expect(screen.getByLabelText("Create Users")).not.toBeChecked();
  });

  it("saves the edit and goes back to the role's panel", async () => {
    mockUpdate.mockResolvedValue({ ...CUSTOM, name: "AU Lead" });
    renderRoute({ path: `${ROLES}/admin.custom_abc/edit`, children: withAdmin });

    const name = await screen.findByLabelText(/Role name/);
    fireEvent.change(name, { target: { value: "AU Lead" } });
    fireEvent.click(await screen.findByLabelText("Create Users"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const [, code, body] = mockUpdate.mock.calls[0] ?? [];
    expect(code).toBe("admin.custom_abc");
    expect(body?.name).toBe("AU Lead");
    expect(new Set(body?.permissions)).toEqual(
      new Set(["admin.user.view", "admin.user.assign_app", "admin.user.create"]),
    );
    expect(await screen.findByRole("complementary", { name: "AU Admin" })).toBeInTheDocument();
  });

  it("will not edit a built-in role, even by its address", async () => {
    renderRoute({ path: `${ROLES}/admin.org_admin/edit`, children: withAdmin });

    expect(await screen.findByText("Built-in roles cannot be changed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("Delete Role asks first, then deletes and closes the panel", async () => {
    mockDelete.mockResolvedValue(undefined);
    const { router } = renderRoute({ path: `${ROLES}/admin.custom_abc`, children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "AU Admin" });
    const menu = await openMenu(
      within(panel).getByRole("button", { name: "More actions for AU Admin" }),
    );

    fireEvent.click(item(menu, "Delete Role"));
    const dialog = await screen.findByRole("dialog", { name: "Delete AU Admin" });
    expect(dialog).toHaveTextContent("Are you sure you want to delete this role?");
    mockPanelRoles.mockResolvedValue([OWNER, ORG_ADMIN]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, Delete" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0]?.[1]).toBe("admin.custom_abc");
    // Off the deleted role's address -- not left on "That role is not in …".
    await waitFor(() => expect(router.state.location.pathname).toBe(ROLES));
    await waitFor(() => expect(screen.queryByText(/That role is not in/)).toBeNull());
    expect(screen.queryByRole("complementary", { name: "AU Admin" })).toBeNull();
  });

  it("shows why a held role cannot be deleted, and keeps the dialog open", async () => {
    mockDelete.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "AU Admin is held by 2 people (1 pending). Take the role away from them first.",
        code: "role_in_use",
        trace_id: "t-1",
      }),
    );
    renderRoute({ path: ROLES, children: withAdmin });
    const row = await screen.findByRole("row", { name: /AU Admin/ });
    const menu = await openMenu(within(row).getByRole("button", { name: "More actions for AU Admin" }));

    fireEvent.click(item(menu, "Delete Role"));
    const dialog = await screen.findByRole("dialog", { name: "Delete AU Admin" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "AU Admin is held by 2 people (1 pending).",
    );
    expect(screen.getByRole("dialog", { name: "Delete AU Admin" })).toBeInTheDocument();
  });
});
