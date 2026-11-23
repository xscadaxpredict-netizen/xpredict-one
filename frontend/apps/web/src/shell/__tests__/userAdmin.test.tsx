/**
 * Editing and removing people.
 *
 * The rules worth pinning down are the refusals, not the happy path: who
 * cannot be removed, what cannot be edited, and what a dealer admin is not
 * shown. Those are the parts that look fine on screen when they are wrong.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type * as dealersApi from "../admin/api/dealers";
import type * as usersApi from "../admin/api/users";
import { fetchUsers, removeUser } from "../admin/api/users";
import { UsersScreen } from "../admin/screens/UsersScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { dealerAdminMembership, me, ownerMembership, adminRoleFor } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
  removeUser: vi.fn().mockResolvedValue(undefined),
  updateUser: vi.fn(),
}));

vi.mock("../admin/api/dealers", async (importOriginal) => ({
  ...(await importOriginal<typeof dealersApi>()),
  fetchDealers: vi.fn().mockResolvedValue([]),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockRemoveUser = vi.mocked(removeUser);

function user(overrides: Partial<usersApi.OrgUser> & { id: string }): usersApi.OrgUser {
  return {
    first_name: "First",
    last_name: "Last",
    email: `${overrides.id}@acmemotors.in`,
    unit_name: null,
    unit_id: null,
    role: "member",
    admin_role: adminRoleFor(overrides.role ?? "member"),
    status: "active",
    apps: [{ app: "dms", role_code: "dms.sales_representative", role_name: "Sales representative", status: "active" }],
    administers: null,
    ...overrides,
  };
}

const OWNER = user({ id: "owner", first_name: "Rahul", last_name: "Kandaswamy", role: "owner" });
const MEMBER = user({ id: "anita", first_name: "Anita", last_name: "Fernandes" });
const INVITED = user({
  id: "sanjay",
  first_name: "Sanjay",
  last_name: "Desai",
  status: "invited",
});

const routes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/users/:userId", element: <UsersScreen /> },
];

/**
 * The ⋮ in the open person's panel header (C78): Edit, Deactivate, Delete.
 * Radix menus open on pointerdown; Enter is the keyboard path jsdom supports.
 */
async function openActionsMenu() {
  const panel = await screen.findByRole("complementary");
  const trigger = within(panel).getByRole("button", { name: /^More actions for / });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.findByRole("menu");
}

async function openEdit() {
  const menu = await openActionsMenu();
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Edit" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchUsers.mockResolvedValue([OWNER, MEMBER, INVITED]);
});

describe("the owner is protected", () => {
  /*
   * An organisation with no owner has nobody who can appoint one (C14). The
   * control is absent rather than present-and-rejected, and the reason is
   * given — an inert menu reads as broken.
   */
  it("offers neither deactivation nor removal, and says why", async () => {
    renderRoute({ path: "/acme-motors/admin/users/owner", children: routes });

    await screen.findByRole("complementary", { name: "Rahul Kandaswamy" });
    const menu = await openActionsMenu();

    for (const name of ["Deactivate", "Delete"]) {
      expect(within(menu).getByRole("menuitem", { name })).toHaveAttribute("aria-disabled", "true");
    }
    expect(menu).toHaveTextContent(/Transfer ownership first/i);
  });
});

describe("removing somebody", () => {
  it("asks first, and says what it actually does", async () => {
    renderRoute({ path: "/acme-motors/admin/users/anita", children: routes });

    await screen.findByRole("complementary", { name: "Anita Fernandes" });
    const menu = await openActionsMenu();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));

    const confirm = await screen.findByRole("dialog");

    // The distinction that matters: access here, not their account.
    expect(confirm).toHaveTextContent(/account is not deleted/i);
    expect(confirm).toHaveTextContent(/name stays on the records they created/i);
    // And it points at the reversible alternative.
    expect(confirm).toHaveTextContent(/Deactivate/i);

    expect(mockRemoveUser).not.toHaveBeenCalled();
  });

  it("closes the panel once they are gone", async () => {
    renderRoute({ path: "/acme-motors/admin/users/anita", children: routes });

    await screen.findByRole("complementary", { name: "Anita Fernandes" });
    fireEvent.click(within(await openActionsMenu()).getByRole("menuitem", { name: "Delete" }));

    mockFetchUsers.mockResolvedValue([OWNER, INVITED]);

    const confirm = await screen.findByRole("dialog");
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Remove from organisation" }),
    );

    await waitFor(() => {
      expect(mockRemoveUser).toHaveBeenCalledWith("acme-motors", "anita");
    });

    /*
     * Back to the list rather than stranded on the URL of somebody who no
     * longer exists — which would be correct but would greet the admin with
     * "that person is no longer in this organisation" about a removal they
     * had just performed on purpose.
     */
    await waitFor(() => {
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    });
    // Back at the list's own address -- not left on theirs, being told they
    // are "no longer in" an organisation the admin just removed them from.
    await waitFor(() => {
      expect(screen.queryByText(/no longer in/i)).not.toBeInTheDocument();
    });
  });

  it("calls it cancelling an invitation when nobody has accepted", async () => {
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: routes });

    await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(await openActionsMenu()).getByRole("menuitem", { name: "Delete" }));

    const confirm = await screen.findByRole("dialog");

    expect(confirm).toHaveTextContent(/has not accepted yet/i);
    // Deactivating somebody who was never active is not a sensible offer.
    expect(confirm).not.toHaveTextContent(/Deactivate/i);
  });
});

describe("editing somebody", () => {
  /*
   * An accepted address is how they sign in; changing it silently is an
   * account takeover with extra steps. An unaccepted one reached nobody and
   * never will, so that typo is worth fixing.
   */
  it("locks the email once the invitation has been accepted", async () => {
    renderRoute({ path: "/acme-motors/admin/users/anita", children: routes });

    await screen.findByRole("complementary", { name: "Anita Fernandes" });
    await openEdit();

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByLabelText(/Email/)).toHaveAttribute("readonly");
    expect(dialog).toHaveTextContent(/cannot be changed here/i);
  });

  it("lets an outstanding invitation be corrected", async () => {
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: routes });

    await screen.findByRole("complementary", { name: "Sanjay Desai" });
    await openEdit();

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByLabelText(/Email/)).not.toHaveAttribute("readonly");
  });

  it("offers no role at all: Edit is basic information only", async () => {
    renderRoute({ path: "/acme-motors/admin/users/anita", children: routes });

    await screen.findByRole("complementary", { name: "Anita Fernandes" });
    await openEdit();

    const dialog = await screen.findByRole("dialog");

    // Standing, and so ownership (C14), is not Edit's to change any more.
    expect(within(dialog).queryByLabelText("Organisation role")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
  });

  /*
   * A dealer admin grants DMS at their own dealer and nothing else (C23), so
   * these fields are ABSENT rather than disabled — a question with one
   * possible answer is a wasted decision.
   */
  it("shows a dealer admin only the name fields", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dealerAdminMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users/anita", children: routes });

    await screen.findByRole("complementary", { name: "Anita Fernandes" });
    await openEdit();

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByLabelText(/First name/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Dealer")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Organisation role")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
