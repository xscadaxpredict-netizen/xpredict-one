/**
 * Regressions for three sign-in and sign-out bugs found in review.
 *
 * All three were invisible: the app looked right and behaved wrongly only on
 * the path nobody clicks — a failed logout, a deep link, a second request
 * nobody counted.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import type * as authApi from "../api/auth";
import { fetchMe, login, logout } from "../api/auth";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockLogin = vi.mocked(login);
const mockLogout = vi.mocked(logout);

function serverError() {
  return new ApiError({
    type: "about:blank",
    title: "Error",
    status: 500,
    detail: "Something went wrong at our end.",
    code: "internal_error",
    trace_id: "test",
  });
}

/**
 * Radix menus open on `pointerdown`, not `click` — a plain click never opens
 * them, and the menu items are not in the document until they do. Enter on the
 * trigger is the keyboard path and works in jsdom without a PointerEvent
 * polyfill.
 */
async function openAccountMenu() {
  const trigger = await screen.findByRole("button", { name: /Account:/ });
  fireEvent.keyDown(trigger, { key: "Enter" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signing out", () => {
  /*
   * The bug: the navigation was in `onSettled`, which runs on failure too. A
   * logout the server refused still sent you to /login with the cookie intact
   * and the cache unemptied — and the route guard, reading a perfectly valid
   * /me, put you straight back in with nothing saying why. Somebody on a
   * shared machine would believe they had signed out.
   */
  it("stays put and says so when the server refuses", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
    mockLogout.mockRejectedValue(serverError());

    renderRoute({ path: "/acme-motors" });

    await openAccountMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/still signed in/i);

    // Not sent to the sign-in screen on a logout that did not happen.
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("leaves when the server confirms", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
    mockLogout.mockResolvedValue(undefined);

    renderRoute({ path: "/acme-motors" });

    await openAccountMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("signing in", () => {
  /*
   * The bug: `useLogin` invalidated /me AND the login screen called fetchMe()
   * itself — two requests for one question, and the two navigations that
   * followed raced each other.
   */
  it("asks the server who you are exactly once", async () => {
    mockFetchMe.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Authentication required",
        status: 401,
        detail: "Sign in to continue.",
        code: "not_authenticated",
        trace_id: "test",
      }),
    );
    mockLogin.mockResolvedValue(undefined);

    renderRoute({ path: "/login" });

    await screen.findByRole("heading", { name: "Sign in" });

    // The signed-out check on arrival.
    await waitFor(() => {
      expect(mockFetchMe).toHaveBeenCalledTimes(1);
    });

    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "rahul@acmemotors.in" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correcthorse1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("heading", { name: "Your apps" });

    // One more for the sign-in itself, and no second copy of the same question.
    expect(mockFetchMe).toHaveBeenCalledTimes(2);
  });

  /*
   * The bug: the guard sent people to their organisation root while the login
   * screen sent them to the page they had been blocked from, and whichever
   * resolved last won. The deep link survived by luck.
   */
  it("returns to the page that sent you to sign in", async () => {
    mockFetchMe.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Authentication required",
        status: 401,
        detail: "Sign in to continue.",
        code: "not_authenticated",
        trace_id: "test",
      }),
    );
    mockLogin.mockResolvedValue(undefined);

    // Blocked from a deep link, which redirects to /login carrying `from`.
    renderRoute({ path: "/acme-motors/admin/users" });

    await screen.findByRole("heading", { name: "Sign in" });

    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "rahul@acmemotors.in" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correcthorse1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    // Back where they were headed, not dumped on the launcher.
    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();
  });

  it("explains itself to somebody with no organisation", async () => {
    mockFetchMe.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Authentication required",
        status: 401,
        detail: "Sign in to continue.",
        code: "not_authenticated",
        trace_id: "test",
      }),
    );
    mockLogin.mockResolvedValue(undefined);

    renderRoute({ path: "/login" });
    await screen.findByRole("heading", { name: "Sign in" });

    mockFetchMe.mockResolvedValue(me({ memberships: [] }));

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "removed@acmemotors.in" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correcthorse1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/access has been removed/i)).toBeInTheDocument();
  });
});
