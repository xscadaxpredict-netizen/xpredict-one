/**
 * DMS settings -> Users & Roles -> Users (the owner, 2026-11-23): everybody who
 * holds DMS, in the Admin panel's list format, the owner first and always.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import {
  fetchDmsUsers,
  fetchInviteRoles,
  inviteDmsUser,
  type AppUser,
} from "../../products/dms/app-settings/api";
import DmsSettingsRoutes from "../../products/dms/app-settings/routes";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import type * as usersApi from "../admin/api/users";
import { appAccess, me, membership, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../products/dms/app-settings/api", () => ({
  fetchDmsUsers: vi.fn(),
  fetchInviteRoles: vi.fn(),
  inviteDmsUser: vi.fn(),
}));

// The link the dialog ends on comes from the person's record, as in Add User.
vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchInviteLink: vi.fn().mockResolvedValue({
    link: "http://localhost:5173/invite/token-for-priya",
    expires_at: "2026-12-01T00:00:00Z",
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
const mockFetchDmsUsers = vi.mocked(fetchDmsUsers);
const mockFetchInviteRoles = vi.mocked(fetchInviteRoles);
const mockInviteDmsUser = vi.mocked(inviteDmsUser);

/**
 * The owner as `/me` really sends them: every DMS permission by rule (C72),
 * `dms.user.create` among them. The shared factory lists only a few.
 */
function realOwner() {
  const owner = ownerMembership();
  return {
    ...owner,
    apps: owner.apps.map((app) =>
      app.key === "dms"
        ? { ...app, permissions: [...app.permissions, "dms.user.view", "dms.user.create"] }
        : app,
    ),
  };
}

const ROLES = [
  { code: "dms.group_operations", name: "Group operations", summary: "Runs every dealership." },
  {
    code: "dms.fleet_viewer",
    name: "Fleet viewer",
    summary: "Reads every dealership. Changes nothing.",
  },
];

const screens = [{ path: "dms/settings/*", element: <DmsSettingsRoutes /> }];
const PAGE = "/acme-motors/dms/settings/users";

function person(overrides: Partial<AppUser>): AppUser {
  return {
    id: "m-1",
    first_name: "",
    last_name: "",
    email: "someone@acme.test",
    is_owner: false,
    role: { code: "dms.manager", name: "Manager" },
    territories: [],
    status: "active",
    ...overrides,
  };
}

const PEOPLE: AppUser[] = [
  person({
    id: "owner",
    first_name: "Asha",
    last_name: "Rao",
    email: "asha@acme.test",
    is_owner: true,
    role: null,
  }),
  person({
    id: "nish",
    first_name: "Nishanth",
    last_name: "K",
    email: "nish@acme.test",
    role: { code: "dms.sales_representative", name: "Sales representative" },
    territories: ["Chennai — Guindy"],
  }),
  person({
    id: "off",
    first_name: "Ravi",
    last_name: "S",
    email: "ravi@acme.test",
    territories: ["Delhi East"],
    status: "inactive",
  }),
  person({
    id: "inv",
    first_name: "Priya",
    last_name: "M",
    email: "priya@acme.test",
    role: { code: "dms.technician", name: "Technician" },
    status: "pending",
  }),
];

function rows() {
  // The first row is the headings.
  return screen.getAllByRole("row").slice(1);
}

function cellsOf(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

beforeEach(() => {
  mockFetchMe.mockReset();
  mockFetchDmsUsers.mockReset();
  mockFetchInviteRoles.mockReset();
  mockInviteDmsUser.mockReset();
  mockFetchInviteRoles.mockResolvedValue(ROLES);
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
  mockFetchMe.mockResolvedValue(me({ memberships: [realOwner()] }));
});

describe("DMS users", () => {
  it("lists everybody who holds DMS, the owner first as Owner, everywhere", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);

    renderRoute({ path: PAGE, children: screens });

    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    const [owner, nish, ravi, priya] = rows();

    expect(within(owner!).getByText("Owner", { selector: "span" })).toBeInTheDocument();
    expect(cellsOf(owner!)).toEqual(["Owner", "All", "Active", ""]);
    expect(cellsOf(nish!)).toEqual(["Sales representative", "Chennai — Guindy", "Active", ""]);
    expect(cellsOf(ravi!)).toEqual(["Manager", "Delhi East", "Inactive", ""]);
    // Pending: not placed yet, so no territory.
    expect(cellsOf(priya!)).toEqual(["Technician", "—", "Pending", ""]);
    expect(screen.getByText("4 users")).toBeInTheDocument();
  });

  it("filters by status", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);

    renderRoute({ path: PAGE, children: screens });
    await screen.findByText("Asha Rao");

    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), {
      target: { value: "pending" },
    });

    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Priya M")).toBeInTheDocument();
    expect(screen.getByText("1 user")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), {
      target: { value: "inactive" },
    });
    expect(screen.getByText("Ravi S")).toBeInTheDocument();
    expect(screen.queryByText("Asha Rao")).not.toBeInTheDocument();
  });

  it("is searched from the topbar, by name or email", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);

    renderRoute({ path: PAGE, children: screens });
    await screen.findByText("Asha Rao");

    const search = screen.getByPlaceholderText("Search users");
    fireEvent.change(search, { target: { value: "nish@" } });
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Nishanth K")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "nobody" } });
    expect(screen.getByText("No users match “nobody”.")).toBeInTheDocument();
  });

  it("draws each row's ⋮ greyed out, for now", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);

    renderRoute({ path: PAGE, children: screens });
    await screen.findByText("Asha Rao");

    expect(screen.getByRole("button", { name: "More actions for Asha Rao" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("says so, with a retry, when the list cannot load", async () => {
    mockFetchDmsUsers.mockRejectedValue(new Error("boom"));

    renderRoute({ path: PAGE, children: screens });

    expect(await screen.findByText("Could not load users")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });
});

describe("Add User", () => {
  async function openDialog() {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);
    renderRoute({ path: PAGE, children: screens });
    await screen.findByText("Asha Rao");
    fireEvent.click(screen.getByRole("button", { name: /Add User/ }));
    return screen.findByRole("dialog", { name: "Add user" });
  }

  function fill(dialog: HTMLElement, role = "dms.fleet_viewer") {
    fireEvent.change(within(dialog).getByLabelText("First name"), { target: { value: "Priya" } });
    fireEvent.change(within(dialog).getByLabelText("Last name"), { target: { value: "M" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: "priya@acme.test" },
    });
    fireEvent.change(within(dialog).getByLabelText("Role in DMS"), { target: { value: role } });
  }

  it("offers DMS's organisation-level roles, each with what it does", async () => {
    const dialog = await openDialog();

    const picker = within(dialog).getByLabelText("Role in DMS");
    await within(dialog).findByRole("option", { name: "Group operations" });
    expect(
      within(picker)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Select a role…", "Group operations", "Fleet viewer"]);

    fireEvent.change(picker, { target: { value: "dms.fleet_viewer" } });
    expect(
      within(dialog).getByText("Reads every dealership. Changes nothing."),
    ).toBeInTheDocument();
  });

  it("sends the person and the role, never the app, then shows the link", async () => {
    mockInviteDmsUser.mockResolvedValue({
      id: "inv-priya",
      first_name: "Priya",
      last_name: "M",
      email: "priya@acme.test",
      is_owner: false,
      role: { code: "dms.fleet_viewer", name: "Fleet viewer" },
      territories: [],
      status: "pending",
    });
    const dialog = await openDialog();
    await within(dialog).findByRole("option", { name: "Fleet viewer" });

    fill(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add user" }));

    expect(await screen.findByRole("heading", { name: "User added" })).toBeInTheDocument();
    expect(mockInviteDmsUser).toHaveBeenCalledWith("acme-motors", {
      first_name: "Priya",
      last_name: "M",
      email: "priya@acme.test",
      role: "dms.fleet_viewer",
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Invitation link")).toHaveValue(
        "http://localhost:5173/invite/token-for-priya",
      );
    });
  });

  it("asks for a role before sending anything", async () => {
    const dialog = await openDialog();
    await within(dialog).findByRole("option", { name: "Fleet viewer" });

    fill(dialog, "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add user" }));

    expect(await within(dialog).findByText("Choose a role.")).toBeInTheDocument();
    expect(mockInviteDmsUser).not.toHaveBeenCalled();
  });

  it("says what the server refused, and keeps the form", async () => {
    mockInviteDmsUser.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Somebody in this organisation already uses that address.",
        code: "person_email_taken",
        trace_id: "t-1",
      }),
    );
    const dialog = await openDialog();
    await within(dialog).findByRole("option", { name: "Fleet viewer" });

    fill(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add user" }));

    expect(
      await within(dialog).findByText("Somebody in this organisation already uses that address."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Email")).toHaveValue("priya@acme.test");
  });

  it("is greyed out for somebody who may see the list but not add", async () => {
    mockFetchMe.mockResolvedValue(
      me({
        memberships: [
          membership({
            role: "owner",
            apps: [appAccess("dms", { permissions: ["dms.user.view"] })],
          }),
        ],
      }),
    );
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);

    renderRoute({ path: PAGE, children: screens });
    await screen.findByText("Asha Rao");

    expect(screen.getByRole("button", { name: /Add User/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
