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
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type * as dealersApi from "../admin/api/dealers";
import { fetchDealers, setDealerStatus } from "../admin/api/dealers";
import { DealersScreen } from "../admin/screens/DealersScreen";
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

vi.mock("../admin/api/dealers", async (importOriginal) => ({
  ...(await importOriginal<typeof dealersApi>()),
  fetchDealers: vi.fn(),
  setDealerStatus: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchDealers = vi.mocked(fetchDealers);
const mockSetDealerStatus = vi.mocked(setDealerStatus);

function dealer(overrides: Partial<dealersApi.Dealer> & { id: string }): dealersApi.Dealer {
  return {
    name: "Bangalore — Whitefield",
    code: "BLR-WHF",
    gstin: "29AAGCB7383J1Z4",
    pan: "AAGCB7383J",
    contact_person: "Vikram Nair",
    email: "whitefield@acmemotors.in",
    phone: "+91 80 4123 7788",
    city: "Bengaluru",
    state: "Karnataka",
    postal_code: "560066",
    status: "active",
    user_count: 3,
    created_at: "2026-01-04T09:00:00Z",
    ...overrides,
  };
}

const dealerRoutes = [
  { path: "admin/dealers", element: <DealersScreen /> },
  { path: "admin/dealers/:dealerId", element: <DealersScreen /> },
];

const launcherRoutes = [{ path: "", element: <LauncherScreen /> }];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchDealers.mockResolvedValue([dealer({ id: "unit-1" })]);
  mockSetDealerStatus.mockImplementation((_slug, _id, status) =>
    Promise.resolve(dealer({ id: "unit-1", status })),
  );
});

async function openPanel(dealerId: string, name: RegExp) {
  renderRoute({ path: `/acme-motors/admin/dealers/${dealerId}`, children: dealerRoutes });
  return screen.findByRole("complementary", { name });
}

/**
 * Radix menus open on pointerdown; Enter is the keyboard path jsdom supports.
 *
 * The same helper `userAdmin.test.tsx` wrote for the same reason -- a plain
 * `click` leaves the menu shut and the failure reads as "the item is missing"
 * rather than "the menu never opened".
 */
function openActionsMenu(panel: HTMLElement) {
  fireEvent.keyDown(within(panel).getByRole("button", { name: "More actions" }), {
    key: "Enter",
  });
}

describe("closing a dealership from Administration", () => {
  it("asks the server rather than a fake", async () => {
    /*
     * THE WHOLE POINT OF THIS COMMIT. Before C63 this call went into module
     * memory and no real dealership changed, which is why the assertion is on
     * the arguments and not just on the screen.
     */
    const panel = await openPanel("unit-1", /Whitefield/);

    openActionsMenu(panel);
    fireEvent.click(await screen.findByText("Close dealership"));

    await waitFor(() => {
      expect(mockSetDealerStatus).toHaveBeenCalledWith("acme-motors", "unit-1", "disabled");
    });
  });

  it("reopens a closed one", async () => {
    mockFetchDealers.mockResolvedValue([dealer({ id: "unit-1", status: "disabled" })]);

    const panel = await openPanel("unit-1", /Whitefield/);

    openActionsMenu(panel);
    fireEvent.click(await screen.findByText("Reopen dealership"));

    await waitFor(() => {
      expect(mockSetDealerStatus).toHaveBeenCalledWith("acme-motors", "unit-1", "active");
    });
  });

  it("warns how many people it affects before the click, not after", async () => {
    const panel = await openPanel("unit-1", /Whitefield/);

    openActionsMenu(panel);

    expect(await screen.findByText(/3 people are scoped to this dealer/i)).toBeInTheDocument();
  });
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
