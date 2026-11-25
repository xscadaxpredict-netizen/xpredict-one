/**
 * A closed dealership, from the two sides that can see it (C63, answering Q21).
 *
 * THE ADMIN SIDE: the close and reopen buttons now reach Django. They spent
 * nine sessions moving a value in module memory — the last `USE_FAKE_*` flag
 * switched on anywhere in the product — because C52 would not let the obvious
 * status flag ship and answer Q21 by accident.
 *
 * THE OTHER SIDE: somebody who works at the branch that just closed. They sign
 * in perfectly well, their membership arrives, and nothing opens. What they
 * must get is a sentence explaining that — which is the half C58 could not
 * write, because before C63 a person in this state was indistinguishable from
 * somebody whose access had been removed.
 *
 * WHAT IS NOT TESTED HERE. That the backend refuses their requests: that is
 * `test_dealers_api.py`, and it is the one that decides (C19). These tests pin
 * what the browser shows, which is a different failure — a correct refusal
 * nobody explains is still somebody staring at an empty screen.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { LauncherScreen } from "../screens/LauncherScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { appAccess, me, membership, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchMe = vi.mocked(fetchMe);

const launcherRoutes = [{ path: "", element: <LauncherScreen /> }];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
});

describe("somebody who works at a dealership that has closed", () => {
  /*
   * `unit_closed` arrives on the membership and every app is inaccessible --
   * which is what the backend sends (`_app_data` returns nothing openable), so
   * these fixtures are the real shape rather than a convenient one.
   */
  function closedMembership() {
    return membership({
      unit_id: "unit-1",
      unit_name: "Bangalore — Whitefield",
      unit_closed: true,
      apps: [
        appAccess("dms", { accessible: false }),
        appAccess("admin", { accessible: false }),
      ],
    });
  }

  it("is told that their dealership closed", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [closedMembership()] }));

    renderRoute({ path: "/acme-motors", children: launcherRoutes });

    const message = await screen.findByText(/has been closed/i);
    // Scoped to the message: the dealership's name is in the topbar as well,
    // so a document-wide query finds two and fails for the wrong reason.
    expect(message).toHaveTextContent(/Bangalore — Whitefield/);
  });

  it("is told nothing has been deleted", async () => {
    /*
     * C63 promises the data persists and comes back. Somebody locked out of
     * their work wants to know their records still exist before they want to
     * know who to ask.
     */
    mockFetchMe.mockResolvedValue(me({ memberships: [closedMembership()] }));

    renderRoute({ path: "/acme-motors", children: launcherRoutes });

    expect(await screen.findByText(/Nothing has been deleted/i)).toBeInTheDocument();
  });

  it("is NOT told their access was removed", async () => {
    /*
     * THE SENTENCE C58 ADDED FOR A DIFFERENT PERSON. Somebody removed from
     * their only organisation sees it correctly; this person is entitled,
     * their branch simply shut, and showing it here is the bug C58 fixed one
     * cause along.
     */
    mockFetchMe.mockResolvedValue(me({ memberships: [closedMembership()] }));

    renderRoute({ path: "/acme-motors", children: launcherRoutes });

    await screen.findByText(/has been closed/i);
    expect(screen.queryByText(/access has been removed/i)).not.toBeInTheDocument();
  });

  it("gets no app tiles at all, not disabled ones", async () => {
    /*
     * `visibleApps` would render a subscribed-but-inaccessible app as a
     * DISABLED tile -- correct by C16, useless here. A greyed-out tile invites
     * clicking and explains nothing, and this person has not lost DMS.
     */
    mockFetchMe.mockResolvedValue(me({ memberships: [closedMembership()] }));

    renderRoute({ path: "/acme-motors", children: launcherRoutes });

    await screen.findByText(/has been closed/i);
    expect(screen.queryByRole("button", { name: /DMS/ })).not.toBeInTheDocument();
  });

  it("says the dealership closed rather than that the workspace is being set up", async () => {
    /*
     * ORDERING, AND IT IS LOAD-BEARING. Both branches render the same
     * paragraph element, so the readiness message would be a plausible-looking
     * wrong answer for a closed branch in a perfectly healthy organisation.
     */
    mockFetchMe.mockResolvedValue(
      me({ memberships: [membership({ ...closedMembership(), is_ready: false })] }),
    );

    renderRoute({ path: "/acme-motors", children: launcherRoutes });

    expect(await screen.findByText(/has been closed/i)).toBeInTheDocument();
    expect(screen.queryByText(/still being set up/i)).not.toBeInTheDocument();
  });

  it("leaves an organisation-wide person alone", async () => {
    /*
     * `unit_closed` is false for somebody with no dealership, however many of
     * the organisation's branches are shut -- they are the people who go on
     * reading its records, which is the other half of C63.
     */
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors", children: launcherRoutes });

    await screen.findByText(/Your apps/i);
    expect(screen.queryByText(/has been closed/i)).not.toBeInTheDocument();
  });
});
