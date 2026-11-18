/**
 * The topbar's icon buttons name themselves on hover and focus. Focus is what
 * is exercised here: it opens the tooltip at once, where hover waits a delay.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { me, membership, ownerMembership } from "./factories";

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

describe("topbar tooltips", () => {
  beforeEach(() => {
    vi.mocked(fetchMe).mockResolvedValue(
      me({
        memberships: [
          ownerMembership(),
          membership({ org_id: "org-2", org_name: "Globex Cars", org_slug: "globex-cars" }),
        ],
      }),
    );
  });

  it.each([
    [/^Notifications/, "Notifications"],
    [/^Account:/, "My profile"],
    [/^All apps$/, "All apps"],
    [/^Switch organisation/, "Acme Motors"],
  ])("names the %s button", async (button, tip) => {
    renderRoute({ path: "/acme-motors/admin/users" });

    fireEvent.focus(await screen.findByRole("button", { name: button }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(tip);
  });

  it("stays out of the way while its drawer is open", async () => {
    renderRoute({ path: "/acme-motors/admin/users" });
    const bell = await screen.findByRole("button", { name: /^Notifications/ });

    fireEvent.click(bell);
    await screen.findByRole("dialog", { name: "Notifications" });
    fireEvent.focus(bell);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("has no settings placeholder any more: the Admin panel's shield took its place", async () => {
    renderRoute({ path: "/acme-motors/admin/users" });

    const bell = await screen.findByRole("button", { name: /^Notifications/ });
    expect(bell.nextElementSibling).toHaveAccessibleName("Admin panel");
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
  });
});
