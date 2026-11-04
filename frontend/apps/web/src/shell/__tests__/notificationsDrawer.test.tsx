/**
 * The bell's drawer: what it lists, the filter on its "All" button, and
 * reading. Which notifications EXIST is `useNotifications`, so it is replaced
 * here with a fixed list — the drawer only draws it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import type { AppNotification } from "../hooks/useNotifications";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const markAsRead = vi.fn();
const markAllAsRead = vi.fn();
let notifications: AppNotification[] = [];
let readIds = new Set<string>();

vi.mock("../hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications,
    readIds,
    unreadCount: notifications.filter((n) => !readIds.has(n.id)).length,
    markAsRead,
    markAllAsRead,
  }),
}));

function notification(id: string, type: AppNotification["type"], title: string): AppNotification {
  return {
    id,
    type,
    title,
    subtitle: "",
    dueLabel: "Due Today",
    urgency: "urgent",
    path: "/acme-motors/dms/sales/enquiries",
  };
}

async function openDrawer() {
  fireEvent.click(await screen.findByRole("button", { name: /^Notifications/ }));
  return screen.findByRole("dialog", { name: "Notifications" });
}

/** Radix opens a dropdown on pointerdown, which jsdom does not model; the
 *  keyboard path is the same menu. */
function openFilter(drawer: HTMLElement) {
  fireEvent.keyDown(within(drawer).getByRole("button", { name: /^Show:/ }), { key: "Enter" });
}

describe("the notifications drawer", () => {
  beforeEach(() => {
    vi.mocked(fetchMe).mockResolvedValue(me({ memberships: [ownerMembership()] }));
    markAsRead.mockReset();
    markAllAsRead.mockReset();
    notifications = [
      notification("fu-1", "followup", "Follow-up: Ramesh"),
      notification("comp-1", "complaint", "Complaint: Site 4"),
      notification("call-1", "call", "Call Request: Arun"),
    ];
    readIds = new Set(["call-1"]);
  });

  it("puts the unread count on the bell", async () => {
    renderRoute({ path: "/acme-motors" });

    expect(
      await screen.findByRole("button", { name: "Notifications, 2 unread" }),
    ).toBeInTheDocument();
  });

  it("lists everything, and marks what is unread", async () => {
    renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    const rows = within(drawer).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Unread")).toBeInTheDocument();
    expect(within(rows[2]!).queryByText("Unread")).not.toBeInTheDocument();
  });

  it("narrows the list from the dropdown on the All button", async () => {
    renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    openFilter(drawer);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Complaints/ }));

    expect(within(drawer).getByRole("button", { name: "Show: Complaints" })).toBeInTheDocument();
    expect(within(drawer).getAllByRole("listitem")).toHaveLength(1);
    expect(within(drawer).getByText("Complaint: Site 4")).toBeInTheDocument();
    // Choosing a filter is a click inside the drawer, so it stays open.
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
  });

  it("says so when the filter leaves nothing", async () => {
    readIds = new Set(["fu-1", "comp-1", "call-1"]);
    renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    openFilter(drawer);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Unread/ }));

    expect(within(drawer).getByText("You are all caught up")).toBeInTheDocument();
  });

  it("opens a notification, marking it read", async () => {
    const { router } = renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    fireEvent.click(within(drawer).getByRole("button", { name: /Follow-up: Ramesh/ }));

    expect(markAsRead).toHaveBeenCalledWith("fu-1");
    expect(router.state.location.pathname).toBe("/acme-motors/dms/sales/enquiries");
  });

  it("marks everything read, and has nothing to do once it has", async () => {
    renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    fireEvent.click(within(drawer).getByRole("button", { name: "Mark all as read" }));
    expect(markAllAsRead).toHaveBeenCalledWith(["fu-1", "comp-1", "call-1"]);
  });

  it("says there is nothing when there is nothing", async () => {
    notifications = [];
    renderRoute({ path: "/acme-motors" });
    const drawer = await openDrawer();

    expect(within(drawer).getByText("No notifications at the moment")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  });
});
