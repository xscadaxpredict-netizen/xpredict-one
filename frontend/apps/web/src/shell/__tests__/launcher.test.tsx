/**
 * How the launcher describes who you are.
 *
 * One line of copy, and it had the C40 bug in it. Standing alone no longer
 * says whether somebody administers anything: a dealer admin is `member` with
 * a dealership, made an admin by holding the DMS System administrator role.
 * Read by standing, they came out as "a member of Bangalore — Whitefield".
 *
 * That is the same bug the owner reported in session 5 about the Users list.
 * PR #12 fixed the list, the table and the dialogs when C40 landed; this file
 * said it too and nothing pointed at it, which is why it is tested now rather
 * than just corrected.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import {
  dealerAdminMembership,
  me,
  membership,
  ownerMembership,
  salespersonMembership,
} from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchMe = vi.mocked(fetchMe);

describe("the launcher greeting", () => {
  beforeEach(() => {
    mockFetchMe.mockReset();
  });

  it("calls a dealer admin an admin of their dealership, not a member of it", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dealerAdminMembership()] }));

    renderRoute({ path: "/acme-motors" });

    expect(await screen.findByText(/an admin of Bangalore — Whitefield/)).toBeInTheDocument();
  });

  it("calls a salesperson at the same dealership a member of it", async () => {
    /*
     * The other half, and the reason the dealer-admin case cannot simply read
     * `unit_name`. These two have the SAME standing and the SAME dealership;
     * the only thing separating them is whether Administration is accessible.
     */
    mockFetchMe.mockResolvedValue(me({ memberships: [salespersonMembership()] }));

    renderRoute({ path: "/acme-motors" });

    expect(await screen.findByText(/a member of Chennai — Guindy/)).toBeInTheDocument();
  });

  it("calls the owner the owner", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors" });

    expect(await screen.findByText(/you are the owner/)).toBeInTheDocument();
  });

  it("calls an organisation admin an organisation admin, with no dealership", async () => {
    /*
     * Standing `admin` ALWAYS means the whole organisation now. A membership
     * above `member` must have `unit_id` null --- the database refuses
     * anything else --- so there is no "admin of one dealer" standing left to
     * describe.
     */
    mockFetchMe.mockResolvedValue(
      me({
        memberships: [
          membership({
            role: "admin",
            unit_id: null,
            unit_name: null,
            apps: ownerMembership().apps,
          }),
        ],
      }),
    );

    renderRoute({ path: "/acme-motors" });

    expect(await screen.findByText(/an organisation admin/)).toBeInTheDocument();
  });
});
