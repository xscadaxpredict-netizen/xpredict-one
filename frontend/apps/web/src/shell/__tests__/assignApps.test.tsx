/**
 * Assign applications (C83, designed on the canvas "Assign app dialog"):
 * Admin panel → Users → a person → Applications → "+". Two steps in one
 * dialog -- choose apps, then each app's details (its role today) -- and one
 * request that assigns them all.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type * as usersApi from "../admin/api/users";
import { assignApps, fetchUsers } from "../admin/api/users";
import { fetchRoles } from "../admin/api/roles";
import { UsersScreen } from "../admin/screens/UsersScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { appAccess, me, membership, ownerMembership, roleCatalogue, adminRoleFor } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
  assignApps: vi.fn(),
}));

vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin/api/roles")>()),
  fetchRoles: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockAssignApps = vi.mocked(assignApps);
const mockFetchRoles = vi.mocked(fetchRoles);

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

/** Joined with no app -- the usual newcomer since C83. */
const ASHA = user({ id: "asha", first_name: "Asha", last_name: "Pillai" });
/** Holds DMS already: only CRM is left to give. */
const RAVI = user({
  id: "ravi",
  first_name: "Ravi",
  last_name: "Kumar",
  apps: [{ app: "dms", role_code: "dms.fleet_viewer", role_name: "Fleet viewer", status: "active" }],
});
/** Holds everything the organisation subscribes to (DMS and CRM). */
const MEERA = user({
  id: "meera",
  first_name: "Meera",
  last_name: "Nair",
  apps: [
    { app: "dms", role_code: "dms.fleet_viewer", role_name: "Fleet viewer", status: "active" },
    { app: "crm", role_code: "crm.member", role_name: "CRM user", status: "active" },
  ],
});
const KIRAN = user({ id: "kiran", first_name: "Kiran", last_name: "Bose", status: "invited" });
const OWNER = user({ id: "owner", first_name: "Anita", last_name: "Rao", role: "owner" });

const routes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/users/:userId", element: <UsersScreen /> },
];

beforeEach(() => {
  vi.clearAllMocks();
  // The owner's organisation subscribes to DMS and CRM; E-commerce is not bought.
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchUsers.mockResolvedValue([ASHA, RAVI, MEERA, KIRAN, OWNER]);
  mockFetchRoles.mockResolvedValue(roleCatalogue());
  mockAssignApps.mockImplementation((_org, userId) =>
    Promise.resolve({ ...ASHA, id: userId }),
  );
});

async function openApplications(id: string, name: string) {
  renderRoute({ path: `/acme-motors/admin/users/${id}`, children: routes });
  const panel = await screen.findByRole("complementary", { name });
  fireEvent.click(within(panel).getByRole("tab", { name: "Applications" }));
  return panel;
}

async function openDialog(id: string, name: string) {
  const panel = await openApplications(id, name);
  fireEvent.click(within(panel).getByRole("button", { name: `Assign applications to ${name}` }));
  return screen.findByRole("dialog");
}

function rowNames(dialog: HTMLElement) {
  const list = within(dialog).getByRole("list", { name: /can be given/ });
  return within(list)
    .queryAllByRole("checkbox")
    .map((box) => box.closest("label")?.textContent ?? "");
}

describe("step 1: choosing applications", () => {
  it("lists only apps the organisation subscribes to that the person lacks", async () => {
    const dialog = await openDialog("ravi", "Ravi Kumar");

    const rows = rowNames(dialog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/CRM/);
    // Not E-commerce (not bought), not DMS (held), never the Admin panel.
    expect(dialog).not.toHaveTextContent(/E-commerce/);
  });

  it("searches the apps by name", async () => {
    const dialog = await openDialog("asha", "Asha Pillai");

    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "crm" } });

    expect(rowNames(dialog)).toHaveLength(1);
    expect(rowNames(dialog)[0]).toMatch(/CRM/);
  });

  it("says so when nothing is left to assign", async () => {
    const dialog = await openDialog("meera", "Meera Nair");

    expect(dialog).toHaveTextContent(/already has every app Acme Motors subscribes to/);
    expect(within(dialog).queryByRole("button", { name: /^Assign/ })).not.toBeInTheDocument();
  });

  it("tells a pending person's assigner the apps wait on the invitation", async () => {
    const dialog = await openDialog("kiran", "Kiran Bose");

    expect(dialog).toHaveTextContent(/has not joined yet/);
    expect(within(dialog).getByText("Pending")).toBeInTheDocument();
  });
});

describe("step 2: one app's details", () => {
  it("opens when an app is ticked, offering its organisation-level roles", async () => {
    const dialog = await openDialog("asha", "Asha Pillai");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /DMS/ }));

    const picker = await within(dialog).findByLabelText("Role in DMS");
    const options = within(picker).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Select a role…", "Fleet viewer", "Group operations"]);
    expect(within(dialog).getByText("Information needed to assign this app.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Create a new role" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("will not finish without a role", async () => {
    const dialog = await openDialog("asha", "Asha Pillai");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /DMS/ }));
    await within(dialog).findByLabelText("Role in DMS");

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    expect(await within(dialog).findByText("Choose a role for DMS.")).toBeInTheDocument();
  });

  it("returns to the list with the app ticked and its role shown", async () => {
    const dialog = await openDialog("asha", "Asha Pillai");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /DMS/ }));
    fireEvent.change(await within(dialog).findByLabelText("Role in DMS"), {
      target: { value: "dms.group_operations" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    expect(within(dialog).getByRole("checkbox", { name: /DMS/ })).toBeChecked();
    expect(within(dialog).getByText("Role: Group operations")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Assign 1 app" })).toBeEnabled();
  });

  it("leaves the app unticked when they go back without finishing", async () => {
    const dialog = await openDialog("asha", "Asha Pillai");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /DMS/ }));
    await within(dialog).findByLabelText("Role in DMS");

    fireEvent.click(within(dialog).getByRole("button", { name: "Back to applications" }));

    expect(within(dialog).getByRole("checkbox", { name: /DMS/ })).not.toBeChecked();
    expect(within(dialog).getByRole("button", { name: /^Assign/ })).toBeDisabled();
  });

  it("preselects an app's only role", async () => {
    const dialog = await openDialog("asha", "Asha Pillai");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /CRM/ }));

    expect(await within(dialog).findByLabelText("Role in CRM")).toHaveValue("crm.member");
  });
});

describe("assigning", () => {
  it("sends every chosen app with its role in one request", async () => {
    const dialog = await openDialog("asha", "Asha Pillai");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /DMS/ }));
    fireEvent.change(await within(dialog).findByLabelText("Role in DMS"), {
      target: { value: "dms.fleet_viewer" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /CRM/ }));
    await within(dialog).findByLabelText("Role in CRM");
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign 2 apps" }));

    await waitFor(() => {
      expect(mockAssignApps).toHaveBeenCalledTimes(1);
    });
    expect(mockAssignApps).toHaveBeenCalledWith("acme-motors", "asha", [
      { app: "dms", role: "dms.fleet_viewer" },
      { app: "crm", role: "crm.member" },
    ]);
  });

  it("unticking takes an app back out", async () => {
    const dialog = await openDialog("asha", "Asha Pillai");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /CRM/ }));
    await within(dialog).findByLabelText("Role in CRM");
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /CRM/ }));

    expect(within(dialog).getByRole("button", { name: /^Assign/ })).toBeDisabled();
  });
});

describe("the Admin panel tile", () => {
  // Named as the Admins and Roles tabs name them: the owner administers the
  // organisation too, and read "Organisation admin" here before.
  it("calls the owner the Organization Owner", async () => {
    mockFetchUsers.mockResolvedValue([{ ...OWNER, administers: "organisation" }]);
    const panel = await openApplications("owner", "Anita Rao");

    const tiles = within(panel).getByRole("list", { name: "Anita Rao's applications" });
    expect(within(tiles).getByText("Organization Owner")).toBeInTheDocument();
    expect(within(tiles).queryByText("Organization Admin")).toBeNull();
  });

  it("calls an organisation admin the Organization Admin", async () => {
    mockFetchUsers.mockResolvedValue([{ ...ASHA, role: "admin", administers: "organisation" }]);
    const panel = await openApplications("asha", "Asha Pillai");

    const tiles = within(panel).getByRole("list", { name: "Asha Pillai's applications" });
    expect(within(tiles).getByText("Organization Admin")).toBeInTheDocument();
  });
});

describe("who sees the +", () => {
  it("is not on the owner's panel: they hold every app by rule", async () => {
    const panel = await openApplications("owner", "Anita Rao");

    expect(within(panel).queryByRole("button", { name: /Assign applications/ })).toBeNull();
  });

  it("is not offered without admin.user.assign_app", async () => {
    mockFetchMe.mockResolvedValue(
      me({
        memberships: [
          membership({
            role: "admin",
            apps: [
              appAccess("dms"),
              appAccess("admin", {
                modules: [{ code: "user_management", sub_modules: [{ code: "user", tabs: [] }] }],
                permissions: ["admin.user.view", "admin.user.update"],
              }),
            ],
          }),
        ],
      }),
    );

    const panel = await openApplications("asha", "Asha Pillai");

    expect(within(panel).queryByRole("button", { name: /Assign applications/ })).toBeNull();
  });
});
