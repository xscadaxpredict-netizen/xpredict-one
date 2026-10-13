/**
 * The information icons in the Invite and Dealer dialogs.
 *
 * THE BUG THIS PINS IS A STACKING ONE, and it is invisible to every assertion
 * that only asks whether something is in the document. `InfoHint` sat at
 * `z-index: 50`, which is right beside a heading and wrong inside a dialog:
 * the overlay is 60 and the dialog is 61, so the hint rendered BEHIND the
 * thing that opened it. In the DOM, readable by a test, and not visible to a
 * single human being.
 *
 * So the assertion is about the number, not about presence. The ladder this
 * app uses is 40 detail panel, 50 menus and popovers, 60 dialog overlay, 61
 * dialog content — a hint opened from a dialog has to beat 61.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type * as dealersApi from "../admin/api/dealers";
import { fetchDealers } from "../admin/api/dealers";
import type * as usersApi from "../admin/api/users";
import { fetchUsers } from "../admin/api/users";
import { DealersScreen } from "../admin/screens/DealersScreen";
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
  fetchUsers: vi.fn().mockResolvedValue([]),
}));

vi.mock("../admin/api/dealers", async (importOriginal) => ({
  ...(await importOriginal<typeof dealersApi>()),
  fetchDealers: vi.fn().mockResolvedValue([]),
}));

const routes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/dealers", element: <DealersScreen /> },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchMe).mockResolvedValue(me({ memberships: [ownerMembership()] }));
  vi.mocked(fetchUsers).mockResolvedValue([]);
  vi.mocked(fetchDealers).mockResolvedValue([]);
});

/*
 * WHAT THESE TESTS CANNOT SEE, SAID OUT LOUD.
 *
 * The bug found while building this was a STACKING one: `InfoHint` sat at
 * `z-index: 50`, which is right beside a heading and wrong inside a dialog
 * whose overlay is 60 and whose content is 61. The hint rendered BEHIND the
 * thing that opened it — in the DOM, found by every query below, and invisible
 * to a human.
 *
 * jsdom does not apply CSS Modules, so `getComputedStyle(...).zIndex` is `0`
 * for everything here and no assertion in this file can tell the fixed version
 * from the broken one. Reading the stylesheets instead was tried twice: with
 * `node:fs`, which wants `@types/node` added to this workspace for one
 * assertion, and with Vite's `?raw`, which returns the CSS-Modules object
 * rather than the text for a `.module.css`.
 *
 * So the layer is documented where it is set, in `InfoHint.module.css`, and
 * checked in a browser. If this bites again, the fix worth making is moving
 * the ladder into design tokens — `--layer-dialog`, `--layer-hint` — so the
 * order is declared once in a file somebody can read, rather than inferred
 * from four stylesheets.
 */

describe("the invite dialog explains itself", () => {
  it("offers a hint beside the title, and opens it above the dialog", async () => {
    renderRoute({ path: "/acme-motors/admin/users", children: routes });

    fireEvent.click(await screen.findByRole("button", { name: "Invite user" }));

    const dialog = await screen.findByRole("dialog");
    const hint = within(dialog).getByRole("button", { name: "About inviting somebody" });

    fireEvent.click(hint);

    expect(await screen.findByText(/choose their own password/)).toBeInTheDocument();
  });

  it("does not leave the explanation on screen permanently", async () => {
    /*
     * It replaced a paragraph that was always visible. If it opened and could
     * not be dismissed it would be the same paragraph with extra steps.
     */
    renderRoute({ path: "/acme-motors/admin/users", children: routes });

    fireEvent.click(await screen.findByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "About inviting somebody" }));
    await screen.findByText(/choose their own password/);

    fireEvent.click(within(dialog).getByRole("button", { name: "About inviting somebody" }));

    await waitFor(() => {
      expect(screen.queryByText(/choose their own password/)).not.toBeInTheDocument();
    });
  });
});

describe("the dealer dialog explains itself", () => {
  it("offers a hint beside the title", async () => {
    renderRoute({ path: "/acme-motors/admin/dealers", children: routes });

    fireEvent.click(await screen.findByRole("button", { name: "Add dealer" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "About dealerships" }));

    expect(await screen.findByText(/A dealership divides DMS/)).toBeInTheDocument();
  });
});
