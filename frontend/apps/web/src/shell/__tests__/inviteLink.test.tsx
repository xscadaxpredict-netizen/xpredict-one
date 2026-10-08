/**
 * Handing the invitation link to an admin (C56).
 *
 * THE OWNER CHOSE COPY-ANY-TIME over revealing the link once, because
 * show-once sets a trap: close the dialog by accident, press Resend to get the
 * link back, and the link already sent to the person stops working. So Copy and
 * Resend are two different verbs and these tests pin the difference.
 *
 * THE WORST BUG THIS GUARDS is the one that WORKS: showing one person's link
 * while a different person's row is open. An admin would copy it, send it, and
 * the wrong colleague would join as somebody else — with nothing anywhere
 * saying so.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type * as usersApi from "../admin/api/users";
import { fetchInviteLink, fetchUsers } from "../admin/api/users";
import { UsersScreen } from "../admin/screens/UsersScreen";
import type * as authApi from "../api/auth";
import { fetchMe } from "../api/auth";
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
  fetchInviteLink: vi.fn(),
  resendInvitation: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockFetchLink = vi.mocked(fetchInviteLink);

/*
 * Held in a variable rather than read back off `navigator.clipboard`, so the
 * assertions do not detach a method from its object -- which is what
 * `@typescript-eslint/unbound-method` objects to, and it is right to: a
 * clipboard method pulled off its owner is exactly the kind of call that works
 * in a test and throws in a browser.
 */
let writeText = vi.fn();

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

const USERS: usersApi.OrgUser[] = [
  user({ id: "sanjay", first_name: "Sanjay", last_name: "Desai", status: "invited" }),
  user({ id: "priya", first_name: "Priya", last_name: "Raghunathan", status: "invited" }),
  user({ id: "anita", first_name: "Anita", last_name: "Fernandes", status: "active" }),
];

const adminRoutes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/users/:userId", element: <UsersScreen /> },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchUsers.mockResolvedValue(USERS);
  mockFetchLink.mockImplementation((_org, userId) =>
    Promise.resolve({
      link: `http://localhost:5173/invite/token-for-${userId}`,
      expires_at: "2026-10-21T00:00:00Z",
    }),
  );

  /*
   * jsdom has no clipboard. Showing the link does not touch it at all now —
   * copying is a separate press on the icon beside the field — so this stub
   * exists to be ASSERTED ON rather than merely tolerated.
   */
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("the link is fetched when it is asked for", () => {
  it("does not go near the token just because a row is open", async () => {
    /*
     * The link carries the credential that joins the organisation as that
     * person. Opening somebody's record is not asking for it, and a field on
     * the users list would have sent it on every visit to this screen.
     */
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    await screen.findByRole("complementary", { name: "Sanjay Desai" });

    expect(mockFetchLink).not.toHaveBeenCalled();
  });

  it("fetches and shows it when Show link is pressed", async () => {
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Show link" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Invitation link")).toHaveValue(
        "http://localhost:5173/invite/token-for-sanjay",
      );
    });
    expect(mockFetchLink).toHaveBeenCalledWith("acme-motors", "sanjay");
  });

  it("says plainly what the link can do", async () => {
    /*
     * The admin is about to paste this into a chat window. Whoever opens it
     * becomes that person in this organisation — there is no password behind
     * it and no second factor.
     */
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Show link" }));

    expect(
      await screen.findByText(/Anyone who opens this link can join as sanjay@acmemotors.in/),
    ).toBeInTheDocument();
  });

  it("does not touch the clipboard just because the link was shown", async () => {
    /*
     * IT USED TO COPY ON OPEN, and that is a surprise in both directions:
     * somebody who only wanted to look at the link has had their clipboard
     * replaced, and somebody who wanted to copy it has no idea whether it
     * happened. Showing and copying are two actions.
     */
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Show link" }));
    await screen.findByLabelText("Invitation link");

    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies only when the copy icon is pressed, and says it did", async () => {
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Show link" }));
    await screen.findByLabelText("Invitation link");

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:5173/invite/token-for-sanjay",
      );
    });
    // The tick is the only confirmation there is, so it has to arrive.
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("leaves the link selectable, so a dead clipboard is not a dead end", async () => {
    /*
     * `navigator.clipboard` is unavailable outside a secure context and can be
     * refused by permissions policy. readOnly rather than disabled is what
     * keeps the text focusable, and therefore selectable by hand.
     */
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Show link" }));

    const field = await screen.findByLabelText("Invitation link");
    expect(field).toHaveAttribute("readonly");
    expect(field).not.toBeDisabled();
  });
});

describe("one person's link never appears under another person's name", () => {
  it("refetches when a different row is opened", async () => {
    /*
     * THE BUG THAT WOULD WORK. Without `key={user.id}` the panel stays
     * mounted, its effect does not run again, and Sanjay's link sits on
     * screen with Priya's record open. The admin copies it, sends it to
     * Priya, and Priya joins as Sanjay.
     */
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Show link" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Invitation link")).toHaveValue(
        "http://localhost:5173/invite/token-for-sanjay",
      );
    });

    fireEvent.click(screen.getByRole("link", { name: "Priya Raghunathan" }));
    const next = await screen.findByRole("complementary", { name: "Priya Raghunathan" });

    /*
     * The panel starts closed again for the new person, which is the other
     * half of the fix: carrying it over OPEN would show Sanjay's link for as
     * long as it took the new fetch to land.
     */
    expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();

    fireEvent.click(within(next).getByRole("button", { name: "Show link" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Invitation link")).toHaveValue(
        "http://localhost:5173/invite/token-for-priya",
      );
    });
  });
});

describe("Copy and Resend are different verbs", () => {
  it("hides the link again when Show is pressed a second time", async () => {
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Show link" }));
    await screen.findByLabelText("Invitation link");

    fireEvent.click(within(panel).getByRole("button", { name: "Hide link" }));

    expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();
  });

  it("offers neither to somebody who has already accepted", async () => {
    renderRoute({ path: "/acme-motors/admin/users/anita", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Anita Fernandes" });

    expect(within(panel).queryByRole("button", { name: "Show link" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Resend" })).not.toBeInTheDocument();
  });

  it("refetches the link when Resend replaces it, and says the old one is dead", async () => {
    /*
     * Resend mints a new token, so the link on screen stopped working the
     * moment it was pressed. It is REFETCHED rather than hidden: the
     * replacement is what the admin needs next, and showing it is the
     * acknowledgement. Leaving the old one up would hand them a dead link that
     * looks exactly like a live one.
     */
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Show link" }));
    await screen.findByLabelText("Invitation link");
    expect(mockFetchLink).toHaveBeenCalledTimes(1);

    fireEvent.click(within(panel).getByRole("button", { name: "Resend" }));

    expect(await screen.findByText(/New link ready/)).toBeInTheDocument();
    await waitFor(() => {
      expect(mockFetchLink).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText("Invitation link")).toBeInTheDocument();
  });

  it("leaves Resend usable rather than turning it into a dead button", async () => {
    /*
     * It used to become a disabled "New link ready" and stay that way, which
     * reads as a broken control — and the label was wide enough to wrap onto
     * two lines in a 360px panel. The acknowledgement belongs with the link it
     * describes; the button stays a button.
     */
    renderRoute({ path: "/acme-motors/admin/users/sanjay", children: adminRoutes });

    const panel = await screen.findByRole("complementary", { name: "Sanjay Desai" });
    fireEvent.click(within(panel).getByRole("button", { name: "Resend" }));

    await screen.findByText(/New link ready/);
    expect(within(panel).getByRole("button", { name: "Resend" })).toBeEnabled();
  });
});
