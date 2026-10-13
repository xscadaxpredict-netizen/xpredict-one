/**
 * Regressions for two bugs a screenshot cannot show.
 *
 * Both came from the same habit: letting one thing quietly control another.
 * The detail panel was handed new props instead of being rebuilt, and the
 * search box was allowed to decide whether the panel existed at all.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

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
  // Resend refreshes the shown link (C56), so this screen now reaches the
  // link endpoint too.
  fetchInviteLink: vi.fn().mockImplementation((_org: string, userId: string) =>
    Promise.resolve({
      link: `http://localhost:5173/invite/token-for-${userId}`,
      expires_at: "2026-10-21T00:00:00Z",
    }),
  ),
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
    administers: null,
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
    // "Resend", not "Resend invitation": there is no email, so the button
    // means "replace the link" and Show is the one that reveals it (C56).
    fireEvent.click(within(panel).getByRole("button", { name: "Resend" }));

    /*
     * Sanjay's panel now shows his new link and the acknowledgement. THAT is
     * what must not travel: the button itself no longer latches into a
     * disabled "New link ready", so the state worth checking is the link and
     * the message beside it.
     */
    await screen.findByText(/New link ready/);
    expect(screen.getByLabelText("Invitation link")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Priya Raghunathan" }));

    const next = await screen.findByRole("complementary", { name: "Priya Raghunathan" });

    expect(within(next).getByRole("button", { name: "Resend" })).toBeEnabled();
    expect(screen.queryByText(/New link ready/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();
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

describe("the role column is standing, and only standing", () => {
  /*
   * IT USED TO CARRY APP ROLES TOO, and this file argued hard that it had to:
   * C40 makes a dealer admin `member`, so a column showing standing alone
   * labels the person who runs a dealership "Member" beside a salesperson who
   * also reads "Member".
   *
   * THE OWNER ASKED FOR THEM OUT ANYWAY, knowing that, because the detail
   * panel already shows what somebody does in each app and the list is for
   * scanning. These tests now pin the decision rather than the argument --- if
   * app roles reappear in this column, it should be because somebody changed
   * their mind, not because a component drifted.
   */
  it("shows the same standing for a dealer admin and a salesperson", async () => {
    mockFetchUsers.mockResolvedValue([
      user({
        id: "boss",
        first_name: "Vikram",
        last_name: "Nair",
        unit_id: "unit-2",
        unit_name: "Bangalore — Whitefield",
        role: "member",
        apps: [
          { app: "dms", role_code: "dms.system_admin", role_name: "System administrator" },
        ],
        administers: "dealer",
      }),
      user({
        id: "seller",
        first_name: "Sanjay",
        last_name: "Desai",
        unit_id: "unit-2",
        unit_name: "Bangalore — Whitefield",
        role: "member",
        apps: [
          {
            app: "dms",
            role_code: "dms.sales_representative",
            role_name: "Sales representative",
          },
        ],
      }),
    ]);

    renderRoute({ path: "/acme-motors/admin/users", children: adminRoutes });

    const boss = (await screen.findByRole("link", { name: "Vikram Nair" })).closest("tr");
    const seller = screen.getByRole("link", { name: "Sanjay Desai" }).closest("tr");

    expect(within(boss!).getByText("Member")).toBeInTheDocument();
    expect(within(seller!).getByText("Member")).toBeInTheDocument();

    // AND NOTHING ELSE IN THAT CELL. What they do lives one click away.
    expect(within(boss!).queryByText(/System administrator/)).not.toBeInTheDocument();
    expect(within(boss!).queryByText(/Dealer admin/)).not.toBeInTheDocument();
    expect(within(seller!).queryByText(/Sales representative/)).not.toBeInTheDocument();
  });

  it("shows standing for somebody who holds no apps at all", async () => {
    /*
     * A real case, not a defensive branch: an organisation admin who
     * administers and opens nothing.
     *
     * The row used to say "No apps" here, because the cell listed app roles
     * and an empty one read as data still loading. With the cell showing
     * standing only there is nothing to be empty, and "no apps yet" is the
     * detail panel's line.
     */
    mockFetchUsers.mockResolvedValue([
      user({ id: "lonely", first_name: "Asha", last_name: "Menon", role: "admin", apps: [] }),
    ]);

    renderRoute({ path: "/acme-motors/admin/users", children: adminRoutes });

    const row = (await screen.findByRole("link", { name: "Asha Menon" })).closest("tr");

    expect(within(row!).getByText("Admin")).toBeInTheDocument();
    expect(within(row!).queryByText("No apps")).not.toBeInTheDocument();
  });
});
