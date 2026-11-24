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
  fetchPersonRoles,
  inviteDmsUser,
  removeDmsUser,
  setDmsUserStatus,
  updateDmsUser,
  type AppUser,
} from "../../products/dms/app-settings/api";
import DmsSettingsRoutes from "../../products/dms/app-settings/routes";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import type * as usersApi from "../admin/api/users";
import type * as territoriesApi from "../../products/dms/app-settings/territories";
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
  fetchPersonRoles: vi.fn(),
  updateDmsUser: vi.fn(),
  setDmsUserStatus: vi.fn(),
  removeDmsUser: vi.fn(),
}));

// Edit's Territory field reads DMS's tree (2026-11-24); the rules stay real.
vi.mock("../../products/dms/app-settings/territories", async (importOriginal) => ({
  ...(await importOriginal<typeof territoriesApi>()),
  fetchTerritories: vi.fn().mockResolvedValue([
    {
      id: "root", kind: "organisation", name: "Acme Motors", parent_id: null, is_root: true,
      status: "active", code: null, gstin: "", pan: "", contact_person: "", email: "",
      phone: "", city: "", state: "", postal_code: "", people_count: 0,
    },
    {
      id: "t-guindy", kind: "dealer", name: "Chennai — Guindy", parent_id: "root",
      is_root: false, status: "active", code: null, gstin: "", pan: "", contact_person: "",
      email: "", phone: "", city: "", state: "", postal_code: "", people_count: 1,
    },
    {
      id: "t-delhi", kind: "dealer", name: "Delhi East", parent_id: "root", is_root: false,
      status: "active", code: null, gstin: "", pan: "", contact_person: "", email: "",
      phone: "", city: "", state: "", postal_code: "", people_count: 1,
    },
  ]),
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
const mockFetchPersonRoles = vi.mocked(fetchPersonRoles);
const mockUpdateDmsUser = vi.mocked(updateDmsUser);
const mockSetDmsUserStatus = vi.mocked(setDmsUserStatus);
const mockRemoveDmsUser = vi.mocked(removeDmsUser);

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
        ? {
            ...app,
            permissions: [
              ...app.permissions,
              "dms.user.view",
              "dms.user.create",
              "dms.user.update",
              "dms.user.deactivate",
              "dms.user.delete",
            ],
          }
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
    places: [],
    other_apps: [],
    status: "active",
    access_status: "active",
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
    access_status: null,
  }),
  person({
    id: "nish",
    first_name: "Nishanth",
    last_name: "K",
    email: "nish@acme.test",
    role: { code: "dms.sales_representative", name: "Sales representative" },
    territories: ["Chennai — Guindy"],
    places: [{ id: "t-guindy", name: "Chennai — Guindy" }],
  }),
  person({
    id: "off",
    first_name: "Ravi",
    last_name: "S",
    email: "ravi@acme.test",
    territories: ["Delhi East"],
    places: [{ id: "t-delhi", name: "Delhi East" }],
    status: "inactive",
    access_status: "disabled",
  }),
  person({
    id: "inv",
    first_name: "Priya",
    last_name: "M",
    email: "priya@acme.test",
    role: { code: "dms.technician", name: "Technician" },
    status: "pending",
    access_status: null,
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
  mockFetchPersonRoles.mockReset();
  mockUpdateDmsUser.mockReset();
  mockSetDmsUserStatus.mockReset();
  mockRemoveDmsUser.mockReset();
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
      places: [],
      other_apps: [],
      status: "pending",
      access_status: null,
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

/* ---- A row's ⋮ and the person's panel (2026-11-24) ---------------------------- */

const DEALER_ROLES = [
  { code: "dms.manager", name: "Manager", summary: "Runs one dealership." },
  { code: "dms.technician", name: "Technician", summary: "Does the service work." },
];

/** The ⋮ menu's items for one person, as Radix draws them once it opens. */
async function openMenu(name: string) {
  // Enter, as the Admin panel's Users tests open it: jsdom has no pointer events
  // for Radix's menu to listen to.
  fireEvent.keyDown(screen.getByRole("button", { name: `More actions for ${name}` }), {
    key: "Enter",
  });
  return screen.findByRole("menu");
}

function item(menu: HTMLElement, label: string) {
  return within(menu).getByRole("menuitem", { name: label });
}

async function showList() {
  mockFetchDmsUsers.mockResolvedValue(PEOPLE);
  const rendered = renderRoute({ path: PAGE, children: screens });
  await screen.findByText("Asha Rao");
  return rendered;
}

describe("a row's ⋮", () => {
  it("offers Edit, Deactivate and Delete on somebody who holds DMS", async () => {
    await showList();

    const menu = await openMenu("Nishanth K");

    expect(item(menu, "Edit")).not.toHaveAttribute("aria-disabled");
    expect(item(menu, "Deactivate")).not.toHaveAttribute("aria-disabled");
    expect(item(menu, "Delete")).not.toHaveAttribute("aria-disabled");
  });

  it("offers Activate on somebody whose DMS is switched off", async () => {
    await showList();

    const menu = await openMenu("Ravi S");

    expect(item(menu, "Activate")).toBeInTheDocument();
  });

  it("greys out everything on the owner, and says why", async () => {
    await showList();

    const menu = await openMenu("Asha Rao");

    for (const label of ["Edit", "Deactivate", "Delete"]) {
      expect(item(menu, label)).toHaveAttribute("aria-disabled", "true");
    }
    expect(within(menu).getByText(/holds every app by default/)).toBeInTheDocument();
  });

  it("greys out Deactivate on somebody pending, who has no DMS yet", async () => {
    await showList();

    const menu = await openMenu("Priya M");

    expect(item(menu, "Deactivate")).toHaveAttribute("aria-disabled", "true");
    expect(item(menu, "Edit")).not.toHaveAttribute("aria-disabled");
    expect(item(menu, "Delete")).not.toHaveAttribute("aria-disabled");
  });

  it("greys out each act this person may not do", async () => {
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
    await showList();

    const menu = await openMenu("Nishanth K");

    for (const label of ["Edit", "Deactivate", "Delete"]) {
      expect(item(menu, label)).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("Deactivate switches their DMS off", async () => {
    mockSetDmsUserStatus.mockResolvedValue({
      ...PEOPLE[1]!,
      status: "inactive",
      access_status: "disabled",
    });
    await showList();

    fireEvent.click(item(await openMenu("Nishanth K"), "Deactivate"));

    await waitFor(() =>
      expect(mockSetDmsUserStatus).toHaveBeenCalledWith("acme-motors", "nish", "deactivate"),
    );
  });

  it("says so when the server refuses a Deactivate", async () => {
    mockSetDmsUserStatus.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "That cannot be done right now.",
        code: "conflict",
        trace_id: "t-1",
      }),
    );
    await showList();

    fireEvent.click(item(await openMenu("Nishanth K"), "Deactivate"));

    expect(await screen.findByText("That cannot be done right now.")).toBeInTheDocument();
  });

  it("Delete asks first, then takes DMS away", async () => {
    mockRemoveDmsUser.mockResolvedValue(undefined);
    await showList();

    fireEvent.click(item(await openMenu("Nishanth K"), "Delete"));
    const dialog = await screen.findByRole("dialog", { name: "Remove Nishanth K from DMS?" });
    expect(within(dialog).getByText(/They stay in the organisation/)).toBeInTheDocument();
    expect(mockRemoveDmsUser).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from DMS" }));

    await waitFor(() => expect(mockRemoveDmsUser).toHaveBeenCalledWith("acme-motors", "nish"));
  });
});

describe("Edit", () => {
  async function openEdit(name = "Nishanth K") {
    await showList();
    fireEvent.click(item(await openMenu(name), "Edit"));
    return screen.findByRole("dialog", { name: "Edit user" });
  }

  it("starts from what is saved, and offers the roles that fit them", async () => {
    // Their role LAST: while the list loaded, the box once fell back to the
    // first option and showed a role they do not hold (found in the browser).
    mockFetchPersonRoles.mockResolvedValue([
      ...DEALER_ROLES,
      { code: "dms.sales_representative", name: "Sales representative", summary: "Sells." },
    ]);
    const dialog = await openEdit();

    expect(within(dialog).getByLabelText(/First name/)).toHaveValue("Nishanth");
    expect(within(dialog).getByLabelText(/Email/)).toHaveAttribute("readonly");
    await within(dialog).findByRole("option", { name: "Manager" });
    expect(within(dialog).getByLabelText("Role in DMS")).toHaveValue("dms.sales_representative");
    expect(mockFetchPersonRoles).toHaveBeenCalledWith("acme-motors", "nish");
  });

  it("sends their details and the new role", async () => {
    mockFetchPersonRoles.mockResolvedValue([
      { code: "dms.sales_representative", name: "Sales representative", summary: "Sells." },
      ...DEALER_ROLES,
    ]);
    mockUpdateDmsUser.mockResolvedValue(PEOPLE[1]!);
    const dialog = await openEdit();
    await within(dialog).findByRole("option", { name: "Manager" });

    fireEvent.change(within(dialog).getByLabelText(/Last name/), { target: { value: "Kumar" } });
    fireEvent.change(within(dialog).getByLabelText("Role in DMS"), {
      target: { value: "dms.manager" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mockUpdateDmsUser).toHaveBeenCalledWith("acme-motors", "nish", {
        first_name: "Nishanth",
        last_name: "Kumar",
        email: "nish@acme.test",
        role: "dms.manager",
        // Where they work goes with the save, unchanged here.
        territories: ["t-guindy"],
      }),
    );
  });

  it("changes where they work: a place taken off, another added", async () => {
    mockFetchPersonRoles.mockResolvedValue([
      { code: "dms.sales_representative", name: "Sales representative", summary: "Sells." },
    ]);
    mockUpdateDmsUser.mockResolvedValue(PEOPLE[1]!);
    const dialog = await openEdit();
    await within(dialog).findByRole("option", { name: /Delhi East/ });

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Chennai — Guindy" }));
    expect(within(dialog).getByText("No territory yet")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Add a place"), {
      target: { value: "t-delhi" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mockUpdateDmsUser).toHaveBeenCalledWith(
        "acme-motors",
        "nish",
        expect.objectContaining({ territories: ["t-delhi"] }),
      ),
    );
  });

  it("says somebody pending is placed once they join, and sends no places", async () => {
    mockFetchPersonRoles.mockResolvedValue(ROLES);
    mockUpdateDmsUser.mockResolvedValue(PEOPLE[3]!);
    const dialog = await openEdit("Priya M");
    await within(dialog).findByRole("option", { name: "Fleet viewer" });

    expect(
      within(dialog).getByText("They are placed in a territory once they have joined."),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Role in DMS"), {
      target: { value: "dms.fleet_viewer" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mockUpdateDmsUser).toHaveBeenCalled());
    expect(mockUpdateDmsUser.mock.calls[0]![2]).not.toHaveProperty("territories");
  });

  it("saves their current role when only their name changes", async () => {
    mockFetchPersonRoles.mockResolvedValue([
      ...DEALER_ROLES,
      { code: "dms.sales_representative", name: "Sales representative", summary: "Sells." },
    ]);
    mockUpdateDmsUser.mockResolvedValue(PEOPLE[1]!);
    const dialog = await openEdit();
    await within(dialog).findByRole("option", { name: "Manager" });

    fireEvent.change(within(dialog).getByLabelText(/Last name/), { target: { value: "Kumar" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mockUpdateDmsUser).toHaveBeenCalledWith(
        "acme-motors",
        "nish",
        expect.objectContaining({ role: "dms.sales_representative" }),
      ),
    );
  });

  it("lets a pending person's address be corrected", async () => {
    mockFetchPersonRoles.mockResolvedValue(ROLES);
    const dialog = await openEdit("Priya M");

    expect(within(dialog).getByLabelText(/Email/)).not.toHaveAttribute("readonly");
  });
});

describe("the person's panel", () => {
  it("opens beside the list with one tab, Basic Info", async () => {
    const { router } = await showList();

    fireEvent.click(screen.getByText("Nishanth K"));

    const panel = await screen.findByRole("complementary", { name: "Nishanth K" });
    expect(router.state.location.pathname).toBe("/acme-motors/dms/settings/users/nish");
    expect(within(panel).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Basic Info",
    ]);
    const facts = within(panel).getByRole("tabpanel");
    expect(within(facts).getByText("Sales representative")).toBeInTheDocument();
    expect(within(facts).getByText("Chennai — Guindy")).toBeInTheDocument();
    expect(within(facts).getByText("Active")).toBeInTheDocument();
    expect(within(facts).getByText("nish@acme.test")).toBeInTheDocument();
  });

  it("shows the owner as Owner, everywhere", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);
    renderRoute({ path: `${PAGE}/owner`, children: screens });

    const panel = await screen.findByRole("complementary", { name: "Asha Rao" });
    const facts = within(panel).getByRole("tabpanel");
    expect(within(facts).getByText("Owner")).toBeInTheDocument();
    expect(within(facts).getByText("All")).toBeInTheDocument();
  });

  it("says so when the address names somebody who no longer holds DMS", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);
    renderRoute({ path: `${PAGE}/gone`, children: screens });

    expect(await screen.findByText(/no longer holds DMS/)).toBeInTheDocument();
  });
});
