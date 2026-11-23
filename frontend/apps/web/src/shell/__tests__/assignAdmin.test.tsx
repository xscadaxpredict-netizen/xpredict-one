/**
 * Assign Admin (C89; the owner, 2026-11-23, from Zoho's): Admins and Roles ->
 * Admins -> Assign Admin, a page with Users and Role. Also reached from a
 * custom role's panel -> Assign Users, with that role chosen.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import AdminRoutes from "../admin/routes";
import type * as adminsApi from "../admin/api/admins";
import { assignAdmin, fetchAdmins } from "../admin/api/admins";
import type * as rolesApi from "../admin/api/roles";
import { fetchPanelRoles, fetchRoleBuilder } from "../admin/api/roles";
import type * as usersApi from "../admin/api/users";
import { fetchUsers } from "../admin/api/users";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { ADMIN_PANEL_TREE, adminRoleFor, appAccess, me, membership, panelRoleFor } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/admins", async (importOriginal) => ({
  ...(await importOriginal<typeof adminsApi>()),
  fetchAdmins: vi.fn(),
  assignAdmin: vi.fn(),
}));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
}));

vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof rolesApi>()),
  fetchPanelRoles: vi.fn(),
  fetchRoleBuilder: vi.fn(),
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
const mockAdmins = vi.mocked(fetchAdmins);
const mockAssign = vi.mocked(assignAdmin);
const mockUsers = vi.mocked(fetchUsers);
const mockPanelRoles = vi.mocked(fetchPanelRoles);
const mockBuilder = vi.mocked(fetchRoleBuilder);

const withAdmin = [{ path: "admin/*", element: <AdminRoutes /> }];
const BASE = "/acme-motors/admin/admins-and-roles";
const PAGE = `${BASE}/assign-admin`;

const MAY_ASSIGN = [
  "admin.admin.view",
  "admin.admin.assign_admin",
  "admin.user.view",
  "admin.role.view",
];

function signedInWith(permissions: string[]) {
  mockFetchMe.mockResolvedValue(
    me({
      memberships: [
        membership({
          role: "admin",
          apps: [appAccess("admin", { modules: ADMIN_PANEL_TREE, permissions })],
        }),
      ],
    }),
  );
}

function person(overrides: Partial<usersApi.OrgUser> & { id: string }): usersApi.OrgUser {
  return {
    first_name: overrides.id,
    last_name: "S",
    email: `${overrides.id}@acme.test`,
    unit_id: null,
    unit_name: null,
    role: "member",
    admin_role: adminRoleFor(overrides.role ?? "member"),
    status: "active",
    apps: [],
    administers: null,
    ...overrides,
  };
}

const PEOPLE = [
  person({ id: "asha", first_name: "Asha", role: "owner" }),
  person({ id: "ravi", first_name: "Ravi", role: "admin" }),
  person({ id: "meena", first_name: "Meena" }),
  person({ id: "arun", first_name: "Arun" }),
  person({ id: "kiran", first_name: "Kiran", status: "invited" }),
  person({ id: "dev", first_name: "Dev", unit_id: "u1", unit_name: "Acme Kochi" }),
];

const ROLES: rolesApi.PanelRole[] = [
  { code: "owner", name: "Organization Owner", summary: "", built_in: true, users: 1, modified_by: null, grantable: false },
  { code: "admin.org_admin", name: "Organization Admin", summary: "", built_in: true, users: 1, modified_by: null, grantable: true },
  { code: "admin.custom_app", name: "Application Admin", summary: "", built_in: false, users: 0, modified_by: "Asha S", grantable: true },
  { code: "admin.custom_big", name: "Super Admin", summary: "", built_in: false, users: 0, modified_by: "Asha S", grantable: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  signedInWith(MAY_ASSIGN);
  mockUsers.mockResolvedValue(PEOPLE);
  mockPanelRoles.mockResolvedValue(ROLES);
  mockBuilder.mockResolvedValue({ modules: [], templates: [] });
  mockAdmins.mockResolvedValue([
    { id: "asha", first_name: "Asha", last_name: "S", email: "asha@acme.test", role: "owner", admin_role: panelRoleFor("owner"), status: "active", apps_managed: [] },
  ]);
});

async function openPeople() {
  const users = await screen.findByRole("combobox", { name: /Users/ });
  fireEvent.focus(users);
  return screen.findByRole("listbox", { name: "People" });
}

describe("the Assign Admin button", () => {
  it("is live for whoever may assign admins, and opens the page", async () => {
    const { router } = renderRoute({ path: BASE, children: withAdmin });

    const button = await screen.findByRole("button", { name: "Assign Admin" });
    expect(button).not.toHaveAttribute("aria-disabled");
    fireEvent.click(button);

    expect(router.state.location.pathname).toBe(PAGE);
    expect(await screen.findByRole("heading", { name: "Assign Admin" })).toBeInTheDocument();
  });

  it("stays greyed without the Users list or the roles to pick from", async () => {
    signedInWith(["admin.admin.view", "admin.admin.assign_admin"]);
    renderRoute({ path: BASE, children: withAdmin });

    expect(await screen.findByRole("button", { name: "Assign Admin" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("the people", () => {
  it("offers members with no Admin panel role; greys pending people and dealerships", async () => {
    renderRoute({ path: PAGE, children: withAdmin });

    const list = await openPeople();
    await within(list).findByRole("option", { name: /Meena/ });

    const names = within(list).getAllByRole("option").map((o) => o.textContent);
    // Not the owner, not somebody already an admin.
    expect(names.some((n) => n?.includes("Asha"))).toBe(false);
    expect(names.some((n) => n?.includes("Ravi"))).toBe(false);
    expect(within(list).getByRole("option", { name: /Kiran/ })).toHaveAttribute("aria-disabled", "true");
    expect(within(list).getByRole("option", { name: /Kiran/ })).toHaveTextContent("Hasn't joined yet");
    expect(within(list).getByRole("option", { name: /Dev/ })).toHaveTextContent("Works at Acme Kochi");
    expect(within(list).getByRole("option", { name: /Meena/ })).not.toHaveAttribute("aria-disabled");
  });

  it("picks several as chips, and a chip can be removed", async () => {
    renderRoute({ path: PAGE, children: withAdmin });
    const list = await openPeople();

    fireEvent.click(await within(list).findByRole("option", { name: /Meena/ }));
    fireEvent.click(within(list).getByRole("option", { name: /Arun/ }));
    fireEvent.click(within(list).getByRole("option", { name: /Kiran/ })); // greyed: ignored

    expect(screen.getByRole("button", { name: "Remove Meena S" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Arun S" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Kiran S" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove Meena S" }));
    expect(screen.queryByRole("button", { name: "Remove Meena S" })).toBeNull();
  });
});

describe("the role", () => {
  it("offers Organization Admin and custom roles, never the owner; greys what you cannot give", async () => {
    renderRoute({ path: PAGE, children: withAdmin });
    const select = await screen.findByRole("combobox", { name: /Role/ });
    await within(select).findByRole("option", { name: "Organization Admin" });

    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "Select the role for the users",
      "Organization Admin",
      "Application Admin",
      "Super Admin — more than you hold",
    ]);
    expect(within(select).getByRole("option", { name: "Super Admin — more than you hold" })).toBeDisabled();
  });

  it("comes chosen from a custom role's Assign Users", async () => {
    renderRoute({ path: `${PAGE}?role=admin.custom_app`, children: withAdmin });

    const select = await screen.findByRole("combobox", { name: /Role/ });
    await within(select).findByRole("option", { name: "Application Admin" });
    expect(select).toHaveValue("admin.custom_app");
  });
});

describe("assigning", () => {
  it("asks for people and a role first", async () => {
    renderRoute({ path: PAGE, children: withAdmin });
    fireEvent.click(await screen.findByRole("button", { name: "Assign" }));

    expect(screen.getByText("Pick at least one person.")).toBeInTheDocument();
    expect(screen.getByText("Choose a role.")).toBeInTheDocument();
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("sends the people and the role, then goes back to the Admins tab", async () => {
    mockAssign.mockResolvedValue([]);
    const { router } = renderRoute({ path: PAGE, children: withAdmin });
    const list = await openPeople();
    fireEvent.click(await within(list).findByRole("option", { name: /Meena/ }));
    fireEvent.click(within(list).getByRole("option", { name: /Arun/ }));
    const select = screen.getByRole("combobox", { name: /Role/ });
    await within(select).findByRole("option", { name: "Application Admin" });
    fireEvent.change(select, { target: { value: "admin.custom_app" } });

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(1));
    expect(mockAssign.mock.calls[0]?.[1]).toEqual({
      users: ["meena", "arun"],
      role: "admin.custom_app",
    });
    await waitFor(() => expect(router.state.location.pathname).toBe(BASE));
  });

  it("shows the server's refusal and stays on the page", async () => {
    mockAssign.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "This person already holds an Admin panel role.",
        code: "already_an_admin",
        trace_id: "t-1",
      }),
    );
    const { router } = renderRoute({ path: PAGE, children: withAdmin });
    const list = await openPeople();
    fireEvent.click(await within(list).findByRole("option", { name: /Meena/ }));
    const select = screen.getByRole("combobox", { name: /Role/ });
    await within(select).findByRole("option", { name: "Organization Admin" });
    fireEvent.change(select, { target: { value: "admin.org_admin" } });

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This person already holds an Admin panel role.",
    );
    expect(router.state.location.pathname).toBe(PAGE);
  });

  it("Cancel goes back to the Admins tab", async () => {
    const { router } = renderRoute({ path: PAGE, children: withAdmin });

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(router.state.location.pathname).toBe(BASE);
  });
});

describe("a custom role's Assign Users", () => {
  it("opens Assign Admin with the role chosen", async () => {
    const { router } = renderRoute({ path: `${BASE}/roles/admin.custom_app`, children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "Application Admin" });

    fireEvent.keyDown(within(panel).getByRole("button", { name: "More actions for Application Admin" }), {
      key: "Enter",
    });
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Assign Users" }));

    expect(router.state.location.pathname).toBe(PAGE);
    expect(router.state.location.search).toBe("?role=admin.custom_app");
  });

  it("is greyed for a role that grants more than you hold", async () => {
    renderRoute({ path: `${BASE}/roles/admin.custom_big`, children: withAdmin });
    const panel = await screen.findByRole("complementary", { name: "Super Admin" });

    fireEvent.keyDown(within(panel).getByRole("button", { name: "More actions for Super Admin" }), {
      key: "Enter",
    });
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByRole("menuitem", { name: "Assign Users" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
