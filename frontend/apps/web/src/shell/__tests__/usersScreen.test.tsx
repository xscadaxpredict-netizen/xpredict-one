/**
 * Regressions for two bugs a screenshot cannot show.
 *
 * Both came from the same habit: letting one thing quietly control another.
 * The detail panel was handed new props instead of being rebuilt, and the
 * search box was allowed to decide whether the panel existed at all.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

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
  resendInvitation: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchUsers = vi.mocked(fetchUsers);

function user(overrides: Partial<usersApi.OrgUser> & { id: string }): usersApi.OrgUser {
  return {
    first_name: "First",
    last_name: "Last",
    email: `${overrides.id}@acmemotors.in`,
    unit_name: null,
    unit_id: null,
    role: "member",
    status: "active",
    apps: [],
    ...overrides,
  };
}

/** Two people awaiting an invitation, so "resend" is offered on both. */
const USERS: usersApi.OrgUser[] = [
  user({ id: "sanjay", first_name: "Sanjay", last_name: "Desai", status: "invited" }),
  user({ id: "priya", first_name: "Priya", last_name: "Raghunathan", status: "invited" }),
];

/*
 * Two entries rather than one optional segment, matching how the real route
 * table declares them — a test that registers its routes differently from the
 * app is testing a screen the app does not serve.
 */
const adminRoutes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/users/:userId", element: <UsersScreen /> },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchUsers.mockResolvedValue(USERS);
});

describe("the detail panel is rebuilt per person", () => {
  /*
   * The bug: the panel sat at the same position in the tree for every row, so
   * React kept one instance alive and handed it new props. The resend
   * mutation's success flag came with it — meaning the SECOND invited person
   * you opened had a disabled "Invitation sent" button and no way to resend.
   */
  it("does not carry a completed resend onto the next person", async () => {
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Resend invitation" }));

    // Sanjay's own button is now spent, which is correct for Sanjay.
    await waitFor(() => {
      expect(within(panel).getByRole("button", { name: "Invitation sent" })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole("link", { name: "Priya Raghunathan" }));

    const next = await screen.findByRole("complementary", { name: "Priya Raghunathan" });

    expect(within(next).getByRole("button", { name: "Resend invitation" })).toBeEnabled();
  });
});

describe("the search filters the list, not the open record", () => {
  /*
   * The bug: the panel was rendered inside the "are there rows?" branch, so a
   * search matching nothing unmounted it — while the URL still named the
   * person. The "no longer in this organisation" fallback could not fire
   * either, because it asks for the person in the FULL list, where they were
   * still present. Net result: the address bar said somebody was open, the
   * screen showed nothing, and nothing explained why.
   */
  it("keeps the panel open when the search matches nothing", async () => {
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    await screen.findByRole("complementary", { name: "Sanjay Desai" });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzzz" } });

    // The list says there are no matches...
    expect(await screen.findByText("No users match your search")).toBeInTheDocument();

    // ...and the record somebody is reading is still on screen.
    expect(screen.getByRole("complementary", { name: "Sanjay Desai" })).toBeInTheDocument();
  });

  it("still explains a URL naming somebody who is not there", async () => {
    renderRoute({ path: "/acme-motors/admin/users/nobody", children: adminRoutes });

    expect(await screen.findByText(/no longer in/i)).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});

describe("the list says what a person does, not only their standing", () => {
  /*
   * THE BUG THE OWNER REPORTED, in its second form. The first time, a toggle
   * granted the Administration app while leaving standing at `member`, and the
   * list displayed "Member" for somebody who ran a dealership.
   *
   * C40 brings the same display back by design: a dealer admin IS `member`
   * now, because standing and app roles are independent axes. So the column
   * cannot show standing alone — two people reading "Member" where one runs the
   * dealership and the other sells cars is not a list anybody can use.
   */
  it("distinguishes a dealer admin from a salesperson at the same dealership", async () => {
    mockFetchUsers.mockResolvedValue([
      user({
        id: "boss",
        first_name: "Vikram",
        last_name: "Nair",
        unit_id: "unit-2",
        unit_name: "Bangalore — Whitefield",
        role: "member",
        apps: [
          { app: "dms", role: "System administrator" },
          { app: "admin", role: "Dealer admin" },
        ],
      }),
      user({
        id: "seller",
        first_name: "Sanjay",
        last_name: "Desai",
        unit_id: "unit-2",
        unit_name: "Bangalore — Whitefield",
        role: "member",
        apps: [{ app: "dms", role: "Sales representative" }],
      }),
    ]);

    renderRoute({ path: "/acme-motors/admin/users", children: adminRoutes });

    const boss = (await screen.findByRole("link", { name: "Vikram Nair" })).closest("tr");
    const seller = screen.getByRole("link", { name: "Sanjay Desai" }).closest("tr");

    // Both are members. That is the point: standing no longer separates them.
    expect(within(boss!).getByText("Member")).toBeInTheDocument();
    expect(within(seller!).getByText("Member")).toBeInTheDocument();

    // What they DO is what the row has to say.
    expect(within(boss!).getByText(/System administrator/)).toBeInTheDocument();
    expect(within(seller!).getByText(/Sales representative/)).toBeInTheDocument();
  });

  it("says so when somebody holds no apps at all", async () => {
    /*
     * A real case, not a defensive branch: an organisation admin who
     * administers and opens nothing. An empty cell there reads as data still
     * loading.
     */
    mockFetchUsers.mockResolvedValue([
      user({ id: "lonely", first_name: "Asha", last_name: "Menon", role: "admin", apps: [] }),
    ]);

    renderRoute({ path: "/acme-motors/admin/users", children: adminRoutes });

    const row = (await screen.findByRole("link", { name: "Asha Menon" })).closest("tr");

    expect(within(row!).getByText("Admin")).toBeInTheDocument();
    expect(within(row!).getByText("No apps")).toBeInTheDocument();
  });
});
