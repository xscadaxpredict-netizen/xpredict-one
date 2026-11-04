/**
 * The topbar's apps panel: which apps it lists, and what each row lets you do.
 *
 * The rule itself is `visibleApps()` and the launcher tests already pin it.
 * These pin that the panel ASKS it rather than growing a rule of its own ---
 * the old dropdown and the launcher page were kept from drifting by sharing
 * that one function, and a redesign is exactly when a second copy creeps in.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

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

async function openPanel() {
  fireEvent.click(await screen.findByRole("button", { name: "All apps" }));
  return screen.findByRole("dialog", { name: "All apps" });
}

describe("the apps panel", () => {
  beforeEach(() => {
    mockFetchMe.mockReset();
  });

  it("is not offered on the launcher, which already lists every app", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors" });

    await screen.findByRole("heading", { name: "Your apps" });
    expect(screen.queryByRole("button", { name: "All apps" })).not.toBeInTheDocument();
  });

  it("groups the apps under their headings", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();

    const headings = within(panel)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Operations", "Sales & marketing", "Platform"]);
  });

  it("shows an unbought app greyed out and says why, with nothing to press (C16)", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();

    expect(within(panel).getByText("E-commerce")).toBeInTheDocument();
    expect(within(panel).getByText("Not subscribed")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /E-commerce/ })).not.toBeInTheDocument();
  });

  it("does not list an app the organisation bought but this person cannot open (C22)", async () => {
    mockFetchMe.mockResolvedValue(
      me({
        memberships: [
          membership({
            apps: [
              appAccess("dms", { modules: ["sales"] }),
              appAccess("crm", { accessible: false }),
              appAccess("admin", { modules: ["users"], permissions: ["admin.person.view"] }),
            ],
          }),
        ],
      }),
    );

    renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();

    expect(within(panel).getByRole("button", { name: /DMS/ })).toBeInTheDocument();
    expect(within(panel).queryByText("CRM")).not.toBeInTheDocument();
  });

  it("marks the app you are in", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();

    expect(within(panel).getByRole("button", { name: /Administration/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(panel).getByRole("button", { name: /DMS/ })).not.toHaveAttribute("aria-current");
  });

  it("filters by name and says so when nothing matches", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Search apps" }));
    const search = within(panel).getByRole("searchbox", { name: "Find an app" });

    fireEvent.change(search, { target: { value: "dealer" } });
    expect(within(panel).getByRole("button", { name: /DMS/ })).toBeInTheDocument();
    expect(within(panel).queryByText("CRM")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(within(panel).getByText("No app matches that name.")).toBeInTheDocument();
  });

  it("opens the chosen app and closes", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    const { router } = renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();

    fireEvent.click(within(panel).getByRole("button", { name: /DMS/ }));

    expect(router.state.location.pathname).toBe("/acme-motors/dms");
    expect(screen.queryByRole("dialog", { name: "All apps" })).not.toBeInTheDocument();
  });

  it("keeps the search behind an icon until it is asked for", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();

    expect(within(panel).queryByRole("searchbox")).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Search apps" }));
    const search = within(panel).getByRole("searchbox", { name: "Find an app" });
    expect(search).toHaveFocus();
    // The box takes the icon's place.
    expect(within(panel).queryByRole("button", { name: "Search apps" })).not.toBeInTheDocument();
  });

  it("folds an empty search back into the icon, and keeps one with text in it", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();

    fireEvent.click(within(panel).getByRole("button", { name: "Search apps" }));
    let search = within(panel).getByRole("searchbox", { name: "Find an app" });
    fireEvent.change(search, { target: { value: "dealer" } });
    fireEvent.blur(search);
    // Still there: the list is filtered, and the box is what says so.
    search = within(panel).getByRole("searchbox", { name: "Find an app" });

    fireEvent.change(search, { target: { value: "" } });
    fireEvent.blur(search);
    expect(within(panel).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Search apps" })).toBeInTheDocument();
  });

  it("backs out of the search on Escape without closing the drawer", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();

    fireEvent.click(within(panel).getByRole("button", { name: "Search apps" }));
    const search = within(panel).getByRole("searchbox", { name: "Find an app" });
    fireEvent.change(search, { target: { value: "zzz" } });
    fireEvent.keyDown(search, { key: "Escape" });

    expect(screen.getByRole("dialog", { name: "All apps" })).toBeInTheDocument();
    expect(within(panel).queryByRole("searchbox")).not.toBeInTheDocument();
    // And the filter went with it.
    expect(within(panel).getByRole("button", { name: /DMS/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Search apps" })).toHaveFocus();
  });

  it("clears the search from its own button and stays open to type again", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users" });
    const panel = await openPanel();

    fireEvent.click(within(panel).getByRole("button", { name: "Search apps" }));
    const search = within(panel).getByRole("searchbox", { name: "Find an app" });
    expect(within(panel).queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Clear search" }));

    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(within(panel).getByRole("button", { name: /DMS/ })).toBeInTheDocument();
  });
});
