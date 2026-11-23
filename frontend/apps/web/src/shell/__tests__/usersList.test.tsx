/**
 * Admin panel -> User Management -> Users, in the shared list format (C78):
 * a filter (Active, All, Inactive, Pending, Confirmed users), "Add user" on
 * the same row, the topbar's box searching by name or email, and a ⋮ on every
 * row with Edit, Deactivate and Delete.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type * as usersApi from "../admin/api/users";
import { fetchUsers, removeUser, setUserStatus } from "../admin/api/users";
import { UsersScreen } from "../admin/screens/UsersScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { USERS_ONLY_TREE, adminRoleFor, appAccess, me, membership, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
  removeUser: vi.fn().mockResolvedValue(undefined),
  setUserStatus: vi.fn(),
}));

vi.mock("../admin/api/dealers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin/api/dealers")>()),
  fetchDealers: vi.fn().mockResolvedValue([]),
}));

vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin/api/roles")>()),
  fetchRoles: vi.fn().mockResolvedValue([]),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockRemoveUser = vi.mocked(removeUser);
const mockSetStatus = vi.mocked(setUserStatus);

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

const PEOPLE: usersApi.OrgUser[] = [
  user({ id: "owner", first_name: "Asha", last_name: "Rao", role: "owner" }),
  user({
    id: "nish",
    first_name: "Nishanth",
    last_name: "S",
    apps: [
      { app: "dms", role_code: "dms.manager", role_name: "Manager", status: "active" },
      { app: "crm", role_code: "crm.member", role_name: "Member", status: "active" },
    ],
  }),
  user({ id: "gone", first_name: "Ravi", last_name: "Kumar", status: "disabled" }),
  user({ id: "new", first_name: "Priya", last_name: "Iyer", status: "invited" }),
];

const routes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/users/:userId", element: <UsersScreen /> },
];

function names() {
  return screen
    .queryAllByRole("rowheader")
    .map((cell) => within(cell).getByRole("link").textContent);
}

function filterTo(value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "Show" }), { target: { value } });
}

async function openPage() {
  renderRoute({ path: "/acme-motors/admin/users", children: routes });
  await screen.findByRole("table");
}

function openMenu(name: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: `More actions for ${name}` }), {
    key: "Enter",
  });
  return screen.findByRole("menu");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchUsers.mockResolvedValue(PEOPLE);
  mockSetStatus.mockImplementation((_org, userId, status) =>
    Promise.resolve({ ...PEOPLE.find((p) => p.id === userId)!, status }),
  );
});

describe("the filter", () => {
  it("offers the five, starting on Active users", async () => {
    await openPage();

    const filter = screen.getByRole("combobox", { name: "Show" });
    expect(within(filter).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Active users",
      "All users",
      "Inactive users",
      "Pending users",
      "Confirmed users",
    ]);
    expect(filter).toHaveValue("active");
    expect(names()).toEqual(["Asha Rao", "Nishanth S"]);
    expect(screen.getByText("2 users")).toBeInTheDocument();
  });

  it("shows each kind, with a tag that says which", async () => {
    await openPage();

    filterTo("inactive");
    expect(names()).toEqual(["Ravi Kumar"]);
    expect(within(screen.getByRole("row", { name: /Ravi Kumar/ })).getByText("Inactive")).toBeInTheDocument();

    filterTo("pending");
    expect(names()).toEqual(["Priya Iyer"]);
    expect(within(screen.getByRole("row", { name: /Priya Iyer/ })).getByText("Pending")).toBeInTheDocument();

    filterTo("confirmed");
    expect(names()).toEqual(["Asha Rao", "Nishanth S", "Ravi Kumar"]);

    filterTo("all");
    expect(names()).toEqual(["Asha Rao", "Nishanth S", "Ravi Kumar", "Priya Iyer"]);
  });

  it("puts Add user on the same row as the filter", async () => {
    await openPage();

    const filter = screen.getByRole("combobox", { name: "Show" });
    const add = screen.getByRole("button", { name: "Add User" });
    const toolbar = add.parentElement!;
    expect(toolbar).toContainElement(filter);
  });
});

describe("the columns", () => {
  it("are name and email, and how many apps", async () => {
    await openPage();

    const row = screen.getByRole("row", { name: /Nishanth S/ });
    expect(within(row).getByText("nish@acme.test")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
  });
});

describe("the topbar search", () => {
  it("searches users by name or email", async () => {
    await openPage();
    const search = screen.getByPlaceholderText("Search users");

    fireEvent.change(search, { target: { value: "nish" } });
    expect(names()).toEqual(["Nishanth S"]);

    fireEvent.change(search, { target: { value: "owner@acme" } });
    expect(names()).toEqual(["Asha Rao"]);

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(names()).toEqual([]);
    // Inside the table's card, under its headings, as on Applications and
    // Admins -- not floating below an empty heading strip.
    const message = screen.getByText("No active users match “zzz”.");
    expect(screen.getByRole("table").parentElement).toContainElement(message);
  });
});

/** Somebody holding a custom Admin panel role with exactly these Users permissions (C89). */
function signedInHolding(permissions: string[]) {
  mockFetchMe.mockResolvedValue(
    me({
      memberships: [
        membership({
          role: "member",
          admin_role: { code: "admin.custom_app", name: "Application Admin" },
          apps: [appAccess("admin", { modules: USERS_ONLY_TREE, permissions })],
        }),
      ],
    }),
  );
}

describe("the ⋮ follows the viewer's permissions (the owner's report, 2026-11-23)", () => {
  it("greys all three for somebody who may only view people", async () => {
    signedInHolding(["admin.user.view", "admin.user.assign_app", "admin.user.unassign_app"]);
    await openPage();

    const menu = await openMenu("Nishanth S");

    for (const name of ["Edit", "Deactivate", "Delete"]) {
      expect(within(menu).getByRole("menuitem", { name })).toHaveAttribute("aria-disabled", "true");
    }
    expect(menu).toHaveTextContent("Your role lets you view people, not change them.");
  });

  it("offers each act only with its own permission", async () => {
    signedInHolding(["admin.user.view", "admin.user.update"]);
    await openPage();

    const menu = await openMenu("Nishanth S");

    expect(within(menu).getByRole("menuitem", { name: "Edit" })).not.toHaveAttribute("aria-disabled");
    expect(within(menu).getByRole("menuitem", { name: "Deactivate" })).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("the ⋮ on every row", () => {
  it("offers Edit, Deactivate and Delete", async () => {
    await openPage();

    const menu = await openMenu("Nishanth S");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Edit",
      "Deactivate",
      "Delete",
    ]);
  });

  it("Edit opens the edit dialog for that person", async () => {
    await openPage();

    fireEvent.click(within(await openMenu("Nishanth S")).getByRole("menuitem", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Email/)).toHaveValue("nish@acme.test");
  });

  it("Deactivate switches them off", async () => {
    await openPage();

    fireEvent.click(
      within(await openMenu("Nishanth S")).getByRole("menuitem", { name: "Deactivate" }),
    );

    await waitFor(() => {
      expect(mockSetStatus).toHaveBeenCalledWith("acme-motors", "nish", "disabled");
    });
  });

  it("offers Reactivate for somebody already off", async () => {
    await openPage();
    filterTo("inactive");

    fireEvent.click(
      within(await openMenu("Ravi Kumar")).getByRole("menuitem", { name: "Reactivate" }),
    );

    await waitFor(() => {
      expect(mockSetStatus).toHaveBeenCalledWith("acme-motors", "gone", "active");
    });
  });

  it("Delete asks first, then removes them", async () => {
    await openPage();

    fireEvent.click(within(await openMenu("Nishanth S")).getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Remove Nishanth S?");
    expect(mockRemoveUser).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from organisation" }));

    await waitFor(() => {
      expect(mockRemoveUser).toHaveBeenCalledWith("acme-motors", "nish");
    });
  });

  it("Delete on a pending person cancels the invitation, and they cannot be deactivated", async () => {
    await openPage();
    filterTo("pending");

    const menu = await openMenu("Priya Iyer");
    expect(within(menu).getByRole("menuitem", { name: "Deactivate" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Cancel this invitation?");
  });

  it("never lets the owner be deactivated or deleted", async () => {
    await openPage();

    const menu = await openMenu("Asha Rao");
    for (const name of ["Deactivate", "Delete"]) {
      expect(within(menu).getByRole("menuitem", { name })).toHaveAttribute("aria-disabled", "true");
    }
    expect(within(menu).getByRole("menuitem", { name: "Edit" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("does not open the person's panel", async () => {
    const { router } = renderRoute({ path: "/acme-motors/admin/users", children: routes });
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "More actions for Nishanth S" }));

    expect(router.state.location.pathname).toBe("/acme-motors/admin/users");
  });
});

describe("a person opened beside the list", () => {
  async function openPanel(id: string, name: string) {
    renderRoute({ path: `/acme-motors/admin/users/${id}`, children: routes });
    return screen.findByRole("complementary", { name });
  }

  it("has the app panel's header: initials, name, email and the ⋮", async () => {
    const panel = await openPanel("nish", "Nishanth S");

    const heading = within(panel).getByRole("heading", { name: "Nishanth S" });
    // The email under the name; Basic Information repeats it below.
    expect(heading.nextElementSibling).toHaveTextContent("nish@acme.test");
    expect(
      within(panel).getByRole("button", { name: "More actions for Nishanth S" }),
    ).toBeInTheDocument();
  });

  it("has Info and Applications working, Groups and Account Activity greyed out", async () => {
    const panel = await openPanel("nish", "Nishanth S");

    const tabs = within(panel).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Info",
      "Applications",
      "Groups",
      "Account Activity",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).not.toHaveAttribute("aria-disabled");
    expect(tabs[2]).toHaveAttribute("aria-disabled", "true");
    expect(tabs[3]).toHaveAttribute("aria-disabled", "true");
  });

  /** The <dt> with this label, or null. (A <dt> takes no accessible name.) */
  function term(info: HTMLElement, label: string) {
    return within(info).queryByText(label, { selector: "dt" });
  }

  /** The value beside a label in Basic Information: the <dd> after its <dt>. */
  function fact(info: HTMLElement, label: string) {
    const found = term(info, label);
    if (!found) throw new Error(`No "${label}" in Basic Information`);
    return found.nextElementSibling?.textContent;
  }

  it("opens on Info: Basic Information, with status, role, names and email", async () => {
    const panel = await openPanel("nish", "Nishanth S");

    const info = within(panel).getByRole("tabpanel");
    expect(within(info).getByRole("button", { name: "Basic Information" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(fact(info, "Status")).toBe("Active");
    expect(fact(info, "Role")).toBe("User");
    expect(fact(info, "First name")).toBe("Nishanth");
    expect(fact(info, "Last name")).toBe("S");
    expect(fact(info, "Email")).toBe("nish@acme.test");
    // Not confined to a dealer, so no Dealer row.
    expect(term(info, "Dealer")).toBeNull();
  });

  it("names the owner's role as the Admins and Roles tabs do", async () => {
    const panel = await openPanel("owner", "Asha Rao");

    expect(fact(within(panel).getByRole("tabpanel"), "Role")).toBe("Organization Owner");
  });

  it("shows a dash for a missing last name, and the dealer for a dealer admin", async () => {
    mockFetchUsers.mockResolvedValue([
      user({
        id: "kochi",
        first_name: "Kiran",
        last_name: "",
        // A dealer admin is `member` standing with no Admin panel role (C40,
        // C89): their administering is the DMS System administrator role.
        role: "member",
        administers: "dealer",
        unit_id: "u1",
        unit_name: "Acme Kochi",
      }),
    ]);
    const panel = await openPanel("kochi", "Kiran");

    const info = within(panel).getByRole("tabpanel");
    expect(fact(info, "Last name")).toBe("—");
    expect(fact(info, "Role")).toBe("Dealer admin");
    expect(fact(info, "Dealer")).toContain("Acme Kochi");
  });

  it("names a custom Admin panel role's holder by that role, not Organization Admin (C89)", async () => {
    mockFetchUsers.mockResolvedValue([
      user({
        id: "meena",
        first_name: "Meena",
        last_name: "Iyer",
        role: "member",
        admin_role: { code: "admin.custom_app", name: "Application Admin" },
        administers: "organisation",
      }),
    ]);
    const panel = await openPanel("meena", "Meena Iyer");

    expect(fact(within(panel).getByRole("tabpanel"), "Role")).toBe("Application Admin");
  });

  it("folds Basic Information away and back", async () => {
    const panel = await openPanel("nish", "Nishanth S");
    const toggle = within(panel).getByRole("button", { name: "Basic Information" });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(term(panel, "Email")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(term(panel, "Email")).toBeInTheDocument();
  });

  it("switches to Applications: each app with its role", async () => {
    const panel = await openPanel("nish", "Nishanth S");

    fireEvent.click(within(panel).getByRole("tab", { name: "Applications" }));

    expect(within(panel).getByRole("tab", { name: "Applications" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const apps = within(panel).getByRole("list", { name: "Nishanth S's applications" });
    expect(within(apps).getByText("DMS")).toBeInTheDocument();
    expect(within(apps).getByText("Manager")).toBeInTheDocument();
    expect(within(panel).queryByText("Basic Information")).not.toBeInTheDocument();
  });

  it("draws a live + and a tile per app, the tile actions greyed out", async () => {
    const panel = await openPanel("nish", "Nishanth S");
    fireEvent.click(within(panel).getByRole("tab", { name: "Applications" }));

    // Assign applications (C83) is live; the tiles' Edit | Disable | Unassign are not yet.
    expect(
      within(panel).getByRole("button", { name: "Assign applications to Nishanth S" }),
    ).not.toHaveAttribute("aria-disabled");

    const tiles = within(
      within(panel).getByRole("list", { name: "Nishanth S's applications" }),
    ).getAllByRole("listitem");
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) {
      const actions = within(tile).getAllByRole("button");
      expect(actions.map((button) => button.textContent)).toEqual(["Edit", "Disable", "Unassign"]);
      for (const button of actions) {
        expect(button).toHaveAttribute("aria-disabled", "true");
      }
    }
    expect(within(tiles[1]!).getByText("CRM")).toBeInTheDocument();
    expect(within(tiles[1]!).getByText("Member")).toBeInTheDocument();
  });

  it("does nothing when a greyed-out tab is pressed", async () => {
    const panel = await openPanel("nish", "Nishanth S");

    fireEvent.click(within(panel).getByRole("tab", { name: "Groups" }));

    expect(within(panel).getByRole("tab", { name: "Info" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
