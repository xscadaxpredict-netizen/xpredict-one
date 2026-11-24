/**
 * NO TERRITORY, NO RECORDS (the owner, 2026-11-24): somebody holding DMS with
 * no territory sees a notice on every DMS page saying why the lists are empty.
 * Never the owner, never somebody placed somewhere.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { UnplacedNotice } from "../../products/dms/UnplacedNotice";
import { renderRoute } from "./harness";
import { appAccess, me, membership, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: [],
    readIds: new Set<string>(),
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  }),
}));

const mockFetchMe = vi.mocked(fetchMe);
const screens = [{ path: "dms/*", element: <UnplacedNotice /> }];
const PAGE = "/acme-motors/dms/welcome";
const NOTICE = /You have not been placed in a territory yet/;

function dmsMember(places: string[]) {
  return membership({
    role: "member",
    apps: [appAccess("dms", { role: { code: "dms.manager", name: "Manager" }, places })],
  });
}

beforeEach(() => {
  mockFetchMe.mockReset();
});

describe("the not-placed-yet notice", () => {
  it("shows for somebody holding DMS with no territory", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dmsMember([])] }));

    renderRoute({ path: PAGE, children: screens });

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
  });

  it("does not show for somebody placed somewhere", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dmsMember(["Delhi Motors"])] }));

    renderRoute({ path: PAGE, children: screens });

    await waitFor(() => expect(mockFetchMe).toHaveBeenCalled());
    await screen.findByRole("banner");
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("never shows for the owner, who is everywhere and placed nowhere", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: PAGE, children: screens });

    await screen.findByRole("banner");
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
