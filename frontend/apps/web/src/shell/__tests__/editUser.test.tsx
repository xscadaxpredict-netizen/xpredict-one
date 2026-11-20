/**
 * Edit user is BASIC INFORMATION ONLY (the owner, 2026-11-20, as Zoho's):
 * first name, last name, email. Apps, dealer and admin standing each have
 * their own action, so fixing a spelling can never change what somebody can
 * open -- the old Edit sent all of them on every save.
 *
 * Also here, moved from the old access-form tests when that form went: Add
 * User, and a dealership with nobody in it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type * as dealersApi from "../admin/api/dealers";
import { fetchDealers } from "../admin/api/dealers";
import type * as usersApi from "../admin/api/users";
import { fetchUsers, inviteUser, updateUser } from "../admin/api/users";
import { DealersScreen } from "../admin/screens/DealersScreen";
import { UsersScreen } from "../admin/screens/UsersScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { dealerAdminMembership, me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
  inviteUser: vi.fn(),
  fetchInviteLink: vi.fn().mockResolvedValue({
    link: "http://localhost:5173/invite/token-for-invitation-1",
    expires_at: "2026-10-21T00:00:00Z",
  }),
  updateUser: vi.fn(),
}));

vi.mock("../admin/api/dealers", async (importOriginal) => ({
  ...(await importOriginal<typeof dealersApi>()),
  fetchDealers: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockFetchDealers = vi.mocked(fetchDealers);
const mockInviteUser = vi.mocked(inviteUser);
const mockUpdateUser = vi.mocked(updateUser);

function user(overrides: Partial<usersApi.OrgUser> & { id: string }): usersApi.OrgUser {
  return {
    first_name: "First",
    last_name: "Last",
    email: `${overrides.id}@acmemotors.in`,
    unit_name: null,
    unit_id: null,
    role: "member",
    status: "active",
    apps: [{ app: "dms", role_code: "dms.sales_representative", role_name: "Sales representative", status: "active" }],
    administers: null,
    ...overrides,
  };
}

function dealer(overrides: Partial<dealersApi.Dealer> & { id: string }): dealersApi.Dealer {
  return {
    name: "Chennai — Guindy",
    code: null,
    gstin: "33AAPFU0939F1Z2",
    pan: "AAPFU0939F",
    contact_person: "R. Menon",
    email: "guindy@acmemotors.in",
    phone: "+91 44 4000 0000",
    city: "Chennai",
    state: "Tamil Nadu",
    postal_code: "600032",
    status: "active",
    user_count: 4,
    created_at: "2026-01-04T09:00:00Z",
    ...overrides,
  };
}

/** Joined, at a dealership, holding DMS: everything the old Edit used to resend. */
const RAVI = user({
  id: "ravi",
  first_name: "Ravi",
  last_name: "Shankar",
  unit_id: "unit-1",
  unit_name: "Chennai — Guindy",
  apps: [{ app: "dms", role_code: "dms.service_advisor", role_name: "Service advisor", status: "active" }],
});

/** Invited, not joined yet: the one case whose address may still change. */
const KIRAN = user({
  id: "kiran",
  first_name: "Kiran",
  last_name: "Bose",
  email: "kiran.typo@acmemotors.in",
  status: "invited",
  apps: [],
});

const routes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/users/:userId", element: <UsersScreen /> },
];

const dealerRoutes = [
  { path: "admin/dealers", element: <DealersScreen /> },
  { path: "admin/dealers/:dealerId", element: <DealersScreen /> },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchUsers.mockResolvedValue([RAVI, KIRAN]);
  mockFetchDealers.mockResolvedValue([dealer({ id: "unit-1" })]);
  mockUpdateUser.mockImplementation((_org, userId, body) =>
    Promise.resolve({ ...RAVI, id: userId, ...body }),
  );
});

/** Opens Edit from the person's ⋮, as the panel offers it (C78). */
async function openEdit(userId: string, name: string) {
  renderRoute({ path: `/acme-motors/admin/users/${userId}`, children: routes });
  const panel = await screen.findByRole("complementary", { name });
  fireEvent.keyDown(within(panel).getByRole("button", { name: `More actions for ${name}` }), {
    key: "Enter",
  });
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Edit" }));
  return screen.findByRole("dialog");
}

function save(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/ }));
}

describe("Edit user", () => {
  it("asks for basic information only: no dealer, apps, roles or standing", async () => {
    const dialog = await openEdit("ravi", "Ravi Shankar");

    expect(within(dialog).getByRole("heading", { name: "Edit user" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/First name/)).toHaveValue("Ravi");
    expect(within(dialog).getByLabelText(/Last name/)).toHaveValue("Shankar");
    expect(within(dialog).getByLabelText(/Email/)).toHaveValue("ravi@acmemotors.in");

    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
  });

  /*
   * THE POINT OF THE CHANGE. The old Edit sent their dealer, apps and standing
   * back on every save, so a rename could quietly change what they could open.
   */
  it("sends exactly the three fields, and nothing about their access", async () => {
    const dialog = await openEdit("ravi", "Ravi Shankar");

    fireEvent.change(within(dialog).getByLabelText(/First name/), {
      target: { value: "Ravindra" },
    });
    save(dialog);

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalled();
    });
    expect(mockUpdateUser.mock.calls[0]?.[2]).toEqual({
      first_name: "Ravindra",
      last_name: "Shankar",
      email: "ravi@acmemotors.in",
    });
  });

  it("locks a joined person's address: it is how they sign in", async () => {
    const dialog = await openEdit("ravi", "Ravi Shankar");

    expect(within(dialog).getByLabelText(/Email/)).toHaveAttribute("readonly");
    expect(within(dialog).getByText(/how they sign in/)).toBeInTheDocument();
  });

  it("lets a pending person's address be corrected", async () => {
    const dialog = await openEdit("kiran", "Kiran Bose");
    const email = within(dialog).getByLabelText(/Email/);

    expect(email).not.toHaveAttribute("readonly");
    fireEvent.change(email, { target: { value: "kiran.b@acmemotors.in" } });
    save(dialog);

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalled();
    });
    expect(mockUpdateUser.mock.calls[0]?.[2]).toMatchObject({ email: "kiran.b@acmemotors.in" });
  });

  it("will not save without a first name", async () => {
    const dialog = await openEdit("ravi", "Ravi Shankar");

    fireEvent.change(within(dialog).getByLabelText(/First name/), { target: { value: "  " } });
    save(dialog);

    expect(await within(dialog).findByText("Enter a first name.")).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("closes once saved", async () => {
    const dialog = await openEdit("ravi", "Ravi Shankar");

    save(dialog);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

describe("a dealership with nobody in it", () => {
  /*
   * IT OFFERS NO INVITE LINK SINCE C83: an invitation names no dealership any
   * more.
   */
  it("says so, and offers no invite link", async () => {
    mockFetchDealers.mockResolvedValue([dealer({ id: "unit-1", user_count: 0 })]);

    renderRoute({ path: "/acme-motors/admin/dealers/unit-1", children: dealerRoutes });

    const panel = await screen.findByRole("complementary", { name: /Guindy/ });

    expect(panel).toHaveTextContent(/Nobody works here yet/i);
    expect(within(panel).queryByRole("link", { name: /Invite/i })).not.toBeInTheDocument();
  });
});

describe("Add User", () => {
  /*
   * A PERSON AND NOTHING ELSE (C83): first name, last name, email. No scope,
   * no apps, no role -- and the request carries exactly those three.
   */
  it("asks for a person only, and sends exactly that", async () => {
    mockInviteUser.mockResolvedValue(user({ id: "inv-1", status: "invited", apps: [] }));
    renderRoute({ path: "/acme-motors/admin/users", children: routes });
    fireEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Organisation role")).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/First name/), { target: { value: "Kiran" } });
    fireEvent.change(within(dialog).getByLabelText(/Last name/), { target: { value: "Bose" } });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "kiran.b@acmemotors.in" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create invitation/ }));

    await waitFor(() => {
      expect(mockInviteUser).toHaveBeenCalled();
    });
    expect(mockInviteUser.mock.calls[0]?.[1]).toEqual({
      first_name: "Kiran",
      last_name: "Bose",
      email: "kiran.b@acmemotors.in",
    });
  });

  /*
   * ORGANISATION-WIDE ADMINS ONLY: an invited person sits nowhere, so the
   * server refuses a dealer admin (403). The screen does not offer the button.
   */
  it("is not offered to a dealer admin", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dealerAdminMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users", children: routes });

    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "Add User" })).not.toBeInTheDocument();
  });
});
