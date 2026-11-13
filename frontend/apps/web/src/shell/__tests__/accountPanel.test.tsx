/**
 * The panel the avatar opens. Signing out itself is pinned in auth.test.tsx;
 * these pin what the panel shows.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchMe = vi.mocked(fetchMe);

async function openPanel() {
  fireEvent.click(await screen.findByRole("button", { name: /Account:/ }));
  return screen.findByRole("dialog", { name: "Your account" });
}

describe("the account panel", () => {
  beforeEach(() => {
    mockFetchMe.mockReset();
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  });

  it("shows the user ID and the CURRENT organisation's ID", async () => {
    renderRoute({ path: "/acme-motors" });
    const panel = await openPanel();

    expect(within(panel).getByText("User ID").nextElementSibling).toHaveTextContent("user-1");
    expect(within(panel).getByText("Organization ID").nextElementSibling).toHaveTextContent(
      "org-1",
    );
  });

  it("offers My account, marked unavailable until there is a page behind it", async () => {
    renderRoute({ path: "/acme-motors" });
    const panel = await openPanel();

    expect(within(panel).getByRole("button", { name: "My account" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("closes from its own close button", async () => {
    renderRoute({ path: "/acme-motors" });
    const panel = await openPanel();

    fireEvent.click(within(panel).getByRole("button", { name: "Close account panel" }));

    expect(screen.queryByRole("dialog", { name: "Your account" })).not.toBeInTheDocument();
  });
});
