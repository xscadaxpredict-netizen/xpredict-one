/**
 * The organisation switcher: plain text with one membership, a drawer with
 * more, and switching as a navigation (the organisation lives in the URL).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { me, membership, ownerMembership, salespersonMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchMe = vi.mocked(fetchMe);

/** Owner of Acme; a dealer-level member of Globex. */
function twoOrganisations() {
  return me({
    memberships: [
      ownerMembership(),
      {
        ...salespersonMembership(),
        org_id: "org-2",
        org_name: "Globex Cars",
        org_slug: "globex-cars",
      },
    ],
  });
}

async function openDrawer() {
  fireEvent.click(await screen.findByRole("button", { name: /^Switch organisation/ }));
  return screen.findByRole("dialog", { name: "Organisations" });
}

describe("the organisation switcher", () => {
  beforeEach(() => {
    mockFetchMe.mockReset();
  });

  it("is plain text when there is only one organisation (C13)", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors" });

    await screen.findByRole("heading", { name: "Your apps" });
    expect(screen.getAllByText("Acme Motors").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Switch organisation/ })).not.toBeInTheDocument();
  });

  it("lists every organisation with its ID, and marks the current one", async () => {
    mockFetchMe.mockResolvedValue(twoOrganisations());

    renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    const acme = within(drawer).getByRole("button", { name: /^Acme Motors/ });
    const globex = within(drawer).getByRole("button", { name: /^Globex Cars/ });
    expect(acme).toHaveAttribute("aria-current", "true");
    expect(globex).not.toHaveAttribute("aria-current");
    expect(acme).toHaveTextContent("org-1");
    expect(globex).toHaveTextContent("org-2");
    expect(within(drawer).getByText("Current organisation")).toBeInTheDocument();
  });

  it("shows Owner where it is true, and a dealership instead of 'Member'", async () => {
    mockFetchMe.mockResolvedValue(twoOrganisations());

    renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    expect(within(drawer).getByRole("button", { name: /^Acme Motors/ })).toHaveTextContent("Owner");
    const globex = within(drawer).getByRole("button", { name: /^Globex Cars/ });
    expect(globex).toHaveTextContent("Chennai — Guindy");
    // C40: standing alone would call a dealer admin "Member".
    expect(globex).not.toHaveTextContent("Member");
  });

  it("switches by going to the other organisation's address, and closes", async () => {
    mockFetchMe.mockResolvedValue(twoOrganisations());

    const { router } = renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    fireEvent.click(within(drawer).getByRole("button", { name: /^Globex Cars/ }));

    expect(router.state.location.pathname).toBe("/globex-cars");
    expect(screen.queryByRole("dialog", { name: "Organisations" })).not.toBeInTheDocument();
  });

  it("offers Manage only to somebody who can open Administration", async () => {
    mockFetchMe.mockResolvedValue(twoOrganisations());

    const { router } = renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    fireEvent.click(within(drawer).getByRole("button", { name: "Manage" }));

    expect(router.state.location.pathname).toBe("/acme-motors/admin");
  });

  it("hides Manage from a salesperson", async () => {
    mockFetchMe.mockResolvedValue(
      me({
        memberships: [
          salespersonMembership(),
          membership({ org_id: "org-2", org_name: "Globex Cars", org_slug: "globex-cars" }),
        ],
      }),
    );

    renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    expect(within(drawer).queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
  });
});
