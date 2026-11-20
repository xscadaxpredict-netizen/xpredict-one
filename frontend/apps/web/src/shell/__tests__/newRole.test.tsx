/**
 * New Role (C72 piece 5; the owner, 2026-11-20, from Zoho's): Admins and
 * Roles → Roles → Add Role. The grid is the server's section tree; the rules
 * (rule 5, Full, More Permissions) work as you click; Save sends the ticks.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import AdminRoutes from "../admin/routes";
import type * as rolesApi from "../admin/api/roles";
import { createPanelRole, fetchPanelRoles, fetchRoleBuilder } from "../admin/api/roles";
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
  fetchRoleBuilder: vi.fn(),
  fetchPanelRoles: vi.fn(),
  createPanelRole: vi.fn(),
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
const mockBuilder = vi.mocked(fetchRoleBuilder);
const mockPanelRoles = vi.mocked(fetchPanelRoles);
const mockCreate = vi.mocked(createPanelRole);

const withAdmin = [{ path: "admin/*", element: <AdminRoutes /> }];

function adminWith(permissions: string[]) {
  return me({
    memberships: [
      membership({
        role: "admin",
        apps: [
          appAccess("dms"),
          appAccess("admin", { modules: ADMIN_PANEL_TREE, permissions }),
        ],
      }),
    ],
  });
}

const BUILDER: rolesApi.RoleBuilder = {
  modules: [
    {
      code: "organization",
      name: "Organization",
      rows: [
        {
          code: "organization_info",
          name: "Organization Info",
          actions: [
            { code: "view", name: "View", kind: "basic", permission: "admin.organization_info.view" },
          ],
        },
      ],
    },
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
            { code: "update", name: "Edit", kind: "basic", permission: "admin.user.update" },
            { code: "delete", name: "Delete", kind: "basic", permission: "admin.user.delete" },
            { code: "assign_app", name: "Assign app", kind: "special", permission: "admin.user.assign_app" },
            { code: "edit_app", name: "Edit app", kind: "special", permission: "admin.user.edit_app" },
          ],
        },
      ],
    },
  ],
  templates: [
    {
      code: "admin.org_admin",
      name: "Organization Admin",
      permissions: ["admin.organization_info.view", "admin.user.view", "admin.user.create"],
    },
  ],
};

const ROLE_ROWS: rolesApi.PanelRole[] = [
  {
    code: "owner",
    name: "Organization Owner",
    summary: "Every permission.",
    built_in: true,
    users: 1,
    modified_by: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
  mockFetchMe.mockResolvedValue(adminWith(["admin.role.view", "admin.role.create"]));
  mockBuilder.mockResolvedValue(BUILDER);
  mockPanelRoles.mockResolvedValue(ROLE_ROWS);
  mockCreate.mockResolvedValue({
    code: "admin.custom_1",
    name: "People admin",
    summary: "",
    built_in: false,
    users: 0,
    modified_by: "Anita Fernandes",
  });
});

async function openNewRole() {
  renderRoute({ path: "/acme-motors/admin/admins-and-roles/roles/new", children: withAdmin });
  await screen.findByRole("heading", { name: "New Role" });
  await screen.findByRole("region", { name: "User Management" });
}

function box(name: string) {
  return screen.getByRole("checkbox", { name });
}

describe("the grid", () => {
  it("draws the server's modules and pages, with a dash where a page has no action", async () => {
    await openNewRole();

    expect(screen.getByRole("region", { name: "Organization" })).toBeInTheDocument();
    expect(box("View Organization Info")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Create Organization Info" })).toBeNull();
    const orgCard = screen.getByRole("region", { name: "Organization" });
    expect(within(orgCard).getAllByText("Not available").length).toBeGreaterThan(0);
  });

  it("ticks View when anything else on the page is ticked (rule 5)", async () => {
    await openNewRole();

    fireEvent.click(box("Create Users"));

    expect(box("Create Users")).toBeChecked();
    expect(box("View Users")).toBeChecked();
  });

  it("clears the row when View is unticked", async () => {
    await openNewRole();
    fireEvent.click(box("Create Users"));
    fireEvent.click(box("Edit Users"));

    fireEvent.click(box("View Users"));

    for (const name of ["View Users", "Create Users", "Edit Users"]) {
      expect(box(name)).not.toBeChecked();
    }
  });

  it("ticks and clears the whole row with Full, special actions included", async () => {
    await openNewRole();

    fireEvent.click(box("Full access to Users"));
    expect(box("Delete Users")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /More Permissions/ }));
    expect(box("Assign app")).toBeChecked();
    // Users' six: four basic, two special. Organization Info's View is not touched.
    expect(screen.getByText("6 of 7 permissions selected")).toBeInTheDocument();

    fireEvent.click(box("Full access to Users"));
    expect(box("Delete Users")).not.toBeChecked();
    expect(box("Assign app")).not.toBeChecked();
  });

  it("opens More Permissions, and a special action ticks View too", async () => {
    await openNewRole();

    const more = screen.getByRole("button", { name: /More Permissions/ });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(box("Edit app"));

    expect(box("View Users")).toBeChecked();
    expect(screen.getByRole("button", { name: /More Permissions \(1\)/ })).toBeInTheDocument();
  });

  it("copies another role's ticks", async () => {
    await openNewRole();

    fireEvent.change(screen.getByLabelText("Copy permissions from"), {
      target: { value: "admin.org_admin" },
    });

    expect(box("View Organization Info")).toBeChecked();
    expect(box("Create Users")).toBeChecked();
    expect(box("Delete Users")).not.toBeChecked();
    expect(screen.getByText("3 of 7 permissions selected")).toBeInTheDocument();
  });
});

describe("saving", () => {
  it("sends the name, description and ticked permissions, then shows the Roles tab", async () => {
    await openNewRole();
    fireEvent.change(screen.getByLabelText(/Role name/), { target: { value: " People admin " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Runs people." } });
    fireEvent.click(box("Create Users"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });
    const body = mockCreate.mock.calls[0]?.[1];
    expect(body?.name).toBe("People admin");
    expect(body?.description).toBe("Runs people.");
    expect(new Set(body?.permissions)).toEqual(new Set(["admin.user.view", "admin.user.create"]));
    expect(await screen.findByRole("tabpanel", { name: "Roles" })).toBeInTheDocument();
  });

  it("asks for a name before sending anything", async () => {
    await openNewRole();
    fireEvent.click(box("View Users"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a role name.")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("asks for at least one permission", async () => {
    await openNewRole();
    fireEvent.change(screen.getByLabelText(/Role name/), { target: { value: "Empty" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tick at least one permission.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    mockCreate.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "A role with that name already exists.",
        code: "role_name_taken",
        trace_id: "t-1",
      }),
    );
    await openNewRole();
    fireEvent.change(screen.getByLabelText(/Role name/), { target: { value: "Taken" } });
    fireEvent.click(box("View Users"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A role with that name already exists.",
    );
  });
});

describe("Add Role on the Roles tab", () => {
  it("opens New Role for somebody who may build roles", async () => {
    renderRoute({ path: "/acme-motors/admin/admins-and-roles/roles", children: withAdmin });

    const add = await screen.findByRole("link", { name: "Add Role" });
    fireEvent.click(add);

    expect(await screen.findByRole("heading", { name: "New Role" })).toBeInTheDocument();
  });

  it("stays greyed without admin.role.create", async () => {
    mockFetchMe.mockResolvedValue(adminWith(["admin.role.view"]));
    renderRoute({ path: "/acme-motors/admin/admins-and-roles/roles", children: withAdmin });

    expect(await screen.findByRole("button", { name: "Add Role" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
