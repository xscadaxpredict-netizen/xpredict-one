/**
 * C27 — a person who belongs to one dealer may hold DMS and Administration,
 * never an organisation-wide product.
 *
 * WHY THESE TESTS EXIST. Before C27 the coupling between the apps list and the
 * dealer picker ran ONE WAY: clearing DMS cleared the dealer. Nothing stopped an
 * organisation admin ticking DMS *and* CRM *and* picking a dealer, which creates
 * exactly the leak the architecture is built to prevent — CRM does no dealer
 * filtering, so that person would see every dealer's customers.
 *
 * The Administration case is the one worth guarding hardest. "DMS only" is the
 * obvious reading of C27 and it is wrong: a dealer admin is a dealer-scoped
 * membership holding Administration (C23), and that is how an organisation hands
 * a dealership its own administrator. A rule that locked Administration would
 * quietly make dealer admins impossible to create, and every other test here
 * would still pass.
 *
 * NONE OF THIS IS SECURITY. Django refuses the grant in `grant_app_access()`
 * regardless (C19). These tests pin down what the form offers.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import type * as dealersApi from "../admin/api/dealers";
import { fetchDealers } from "../admin/api/dealers";
import type * as usersApi from "../admin/api/users";
import { fetchUsers } from "../admin/api/users";
import { UsersScreen } from "../admin/screens/UsersScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
  inviteUser: vi.fn().mockResolvedValue(undefined),
  updateUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/dealers", async (importOriginal) => ({
  ...(await importOriginal<typeof dealersApi>()),
  fetchDealers: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockFetchDealers = vi.mocked(fetchDealers);

function user(overrides: Partial<usersApi.OrgUser> & { id: string }): usersApi.OrgUser {
  return {
    first_name: "First",
    last_name: "Last",
    email: `${overrides.id}@acmemotors.in`,
    unit_name: null,
    unit_id: null,
    role: "member",
    status: "active",
    apps: [{ app: "dms", role: "Sales executive" }],
    ...overrides,
  };
}

function dealer(overrides: Partial<dealersApi.Dealer> & { id: string }): dealersApi.Dealer {
  return {
    name: "Chennai — Guindy",
    code: null,
    parent_id: null,
    parent_name: null,
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

const GUINDY = dealer({ id: "unit-1" });

/** Somebody organisation-wide, so the edit form shows every field. */
const ANITA = user({ id: "anita", first_name: "Anita", last_name: "Fernandes" });

/**
 * A record C27 forbids: scoped to a dealer AND holding CRM.
 *
 * Unreachable through the form now, which is the point — it stands for a row
 * created before this rule existed, or by a backend that let it through. The
 * form has to let an admin unwind it.
 */
const LEGACY = user({
  id: "sanjay",
  first_name: "Sanjay",
  last_name: "Desai",
  unit_id: "unit-1",
  unit_name: "Chennai — Guindy",
  apps: [
    { app: "dms", role: "Sales executive" },
    { app: "crm", role: "Marketing" },
  ],
});

const routes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/users/:userId", element: <UsersScreen /> },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchUsers.mockResolvedValue([ANITA, LEGACY]);
  mockFetchDealers.mockResolvedValue([GUINDY]);
});

async function openInviteForm() {
  renderRoute({ path: "/acme-motors/admin/users", children: routes });
  fireEvent.click(await screen.findByRole("button", { name: "Invite user" }));
  return screen.findByRole("dialog");
}

async function openEditForm(userId: string, name: string) {
  renderRoute({ path: `/acme-motors/admin/users/${userId}`, children: routes });
  await screen.findByRole("complementary", { name });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  return screen.findByRole("dialog");
}

/**
 * Waits for the dealer list to arrive before selecting from it.
 *
 * The `<select>` renders before its options do, and setting a value that has no
 * matching option is silently a no-op — so asserting straight after the change
 * tests nothing and passes for the wrong reason.
 */
async function chooseDealer(dialog: HTMLElement, name: string, id: string) {
  await within(dialog).findByRole("option", { name });
  fireEvent.change(within(dialog).getByLabelText("Dealer"), { target: { value: id } });
}

describe("inviting somebody into one dealer", () => {
  it("locks the organisation-wide apps once a dealer is chosen", async () => {
    const dialog = await openInviteForm();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "DMS" }));
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");

    // CRM does no dealer filtering, so this person would see every dealer's
    // customers. That is the leak C27 closes.
    expect(within(dialog).getByRole("checkbox", { name: "CRM" })).toBeDisabled();

    // AND THE ONE THAT MUST STAY OPEN. A dealer admin is a dealer-scoped
    // membership holding Administration (C23) — locking this would make them
    // impossible to create, and no other assertion here would notice.
    expect(within(dialog).getByRole("checkbox", { name: "Administration" })).not.toBeDisabled();
  });

  it("refuses a dealer while an organisation-wide app is selected, and says why", async () => {
    const dialog = await openInviteForm();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "DMS" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "CRM" }));

    expect(within(dialog).getByLabelText("Dealer")).toBeDisabled();
    // A greyed control with no reason reads as broken.
    expect(dialog).toHaveTextContent(/Clear the other apps to scope this person to a dealer/i);
  });

  /*
   * Asserts the closing as well as the reopening, deliberately. Checking only
   * that the picker ends up enabled would pass with the whole rule reverted —
   * it was enabled the entire time — and prove nothing. A rule that locks and
   * never unlocks is its own bug, so the transition is the thing worth pinning.
   */
  it("reopens the dealer picker when the organisation-wide app is cleared", async () => {
    const dialog = await openInviteForm();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "DMS" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "CRM" }));
    expect(within(dialog).getByLabelText("Dealer")).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "CRM" }));
    expect(await within(dialog).findByLabelText("Dealer")).not.toBeDisabled();
  });
});

describe("editing somebody who belongs to one dealer", () => {
  it("locks an organisation-wide app they do not already hold", async () => {
    const dialog = await openEditForm("anita", "Anita Fernandes");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "DMS" }));
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");

    expect(within(dialog).getByRole("checkbox", { name: "CRM" })).toBeDisabled();
  });

  /*
   * REMOVING IS NEVER BLOCKED, only adding. Locking an app somebody already
   * holds would leave a forbidden record permanently unfixable — the form would
   * refuse the one edit that brings it into line, and an admin would have no
   * way to act on the backend's own error message.
   */
  it("still lets a forbidden combination be unwound", async () => {
    const dialog = await openEditForm("sanjay", "Sanjay Desai");

    const crm = within(dialog).getByRole("checkbox", { name: "CRM" });

    expect(crm).toBeChecked();
    expect(crm).not.toBeDisabled();

    fireEvent.click(crm);

    expect(crm).not.toBeChecked();
    // Now that it is gone it cannot come back while the dealer stands.
    expect(crm).toBeDisabled();
  });
});
