/**
 * The accept screen: every state somebody can arrive in (C56).
 *
 * THIS IS THE FIRST SCREEN A NEW COLLEAGUE EVER SEES, and they arrive by
 * clicking a link in a chat message with no idea what Xpredict One is. So the
 * tests are mostly about the four dead ends — an expired link, a spent one, an
 * unknown token, and being signed in as somebody else — because each of those
 * is a stranger meeting a blank page if it is wrong.
 *
 * THE ONE THAT PREVENTS A REAL DISASTER is "signed in as somebody else". The
 * innocent version happens constantly: an admin pastes the link to check that
 * it works. Accepting on their account would add the wrong person to the
 * organisation AND spend the invitation, with nothing to show what happened.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import type * as authApi from "../api/auth";
import { fetchMe } from "../api/auth";
import type * as invitationsApi from "../api/invitations";
import { acceptInvitation, fetchInvitation, type InvitationPreview } from "../api/invitations";
import { renderRoute } from "./harness";
import { me, membership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../api/invitations", async (importOriginal) => ({
  ...(await importOriginal<typeof invitationsApi>()),
  fetchInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchInvitation = vi.mocked(fetchInvitation);
const mockAccept = vi.mocked(acceptInvitation);

const TOKEN = "a-real-looking-token";
const PATH = `/invite/${TOKEN}`;

function preview(overrides: Partial<InvitationPreview> = {}): InvitationPreview {
  return {
    organization_name: "Acme Motors",
    organization_slug: "acme-motors",
    email: "priya@acme.test",
    expires_at: "2026-10-21T00:00:00Z",
    is_expired: false,
    is_accepted: false,
    requires_sign_in: false,
    invited_by: "Rahul K",
    ...overrides,
  };
}

function signedOut() {
  mockFetchMe.mockRejectedValue(
    new ApiError({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      detail: "Not signed in.",
      code: "not_authenticated",
      trace_id: "test",
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("somebody with no account yet", () => {
  it("names the organisation and who invited them before asking for anything", async () => {
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview());

    renderRoute({ path: PATH });

    expect(await screen.findByRole("heading", { name: /Join Acme Motors/ })).toBeInTheDocument();
    expect(screen.getByText(/Rahul K invited priya@acme.test/)).toBeInTheDocument();
  });

  it("sets a password and lands on the organisation", async () => {
    /*
     * SIGNED OUT, THEN SIGNED IN, and the order is the point. `/me` has to
     * fail first — they have no account — and succeed after accepting, which
     * sets the cookies. Mocking it as resolved throughout made this test
     * render the "invitation is for someone else" branch and fail looking for
     * a password field, because a signed-in Anita is not Priya.
     */
    mockFetchInvitation.mockResolvedValue(preview());
    mockAccept.mockResolvedValue({ org_slug: "acme-motors", account_created: true });
    mockFetchMe
      .mockRejectedValueOnce(
        new ApiError({
          type: "about:blank",
          title: "Unauthorized",
          status: 401,
          detail: "Not signed in.",
          code: "not_authenticated",
          trace_id: "test",
        }),
      )
      .mockResolvedValue(me({ email: "priya@acme.test", memberships: [membership()] }));

    const { router } = renderRoute({ path: PATH });

    fireEvent.change(await screen.findByLabelText("Choose a password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText("Type it again"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Join Acme Motors/ }));

    await waitFor(() => {
      expect(mockAccept).toHaveBeenCalledWith(TOKEN, {
        password: "correct horse battery staple",
      });
    });

    /*
     * The LAUNCHER, not an app (C15) — which apps they can open is the
     * server's answer and they have only just become somebody who can ask.
     */
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/acme-motors");
    });
  });

  it("will not submit two passwords that differ", async () => {
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview());

    renderRoute({ path: PATH });

    fireEvent.change(await screen.findByLabelText("Choose a password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText("Type it again"), {
      target: { value: "correct horse battery stapler" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Join Acme Motors/ }));

    expect(await screen.findByText("Both passwords must match.")).toBeInTheDocument();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("shows the address and does not let it be changed", async () => {
    /*
     * The invitation was issued FOR this address and it is what they will sign
     * in with. An editable field here would mean accepting as somebody else.
     */
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview());

    renderRoute({ path: PATH });

    const email = await screen.findByLabelText("Email");
    expect(email).toHaveValue("priya@acme.test");
    expect(email).toHaveAttribute("readonly");
  });

  it("puts the server's refusal on screen rather than failing silently", async () => {
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview());
    mockAccept.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "This organisation has not subscribed to that app.",
        code: "app_not_subscribed",
        trace_id: "test",
      }),
    );

    renderRoute({ path: PATH });

    fireEvent.change(await screen.findByLabelText("Choose a password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText("Type it again"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Join Acme Motors/ }));

    expect(
      await screen.findByText("This organisation has not subscribed to that app."),
    ).toBeInTheDocument();
  });
});

describe("somebody whose address already has an account", () => {
  it("is sent to sign in, and NOT offered a password field", async () => {
    /*
     * A link that could set a password on an existing account is a password
     * reset with no proof of who is holding the link. The server refuses it;
     * this is the screen not asking the wrong question in the first place.
     */
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview({ requires_sign_in: true }));

    renderRoute({ path: PATH });

    expect(await screen.findByRole("link", { name: "Sign in to accept" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose a password")).not.toBeInTheDocument();
  });

  it("comes back to the invitation after signing in", async () => {
    /*
     * `state.from` is how `RedirectIfSignedIn` returns somebody to where they
     * were. Without it they sign in, land on their existing organisation, and
     * the invitation is simply lost — they would have to find the chat message
     * again.
     */
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview({ requires_sign_in: true }));

    const { router } = renderRoute({ path: PATH });

    fireEvent.click(await screen.findByRole("link", { name: "Sign in to accept" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(router.state.location.state).toEqual({ from: PATH });
  });
});

describe("somebody who is already signed in", () => {
  it("is not bounced away, and joins with one button", async () => {
    /*
     * ONE LOGIN SPANS ORGANISATIONS (C1), so this is ordinary rather than
     * exceptional. If this route were wrapped in `RedirectIfSignedIn` — as
     * /login and /signup are — this person would be thrown to their own
     * launcher and could never accept.
     */
    mockFetchMe.mockResolvedValue(
      me({ email: "priya@acme.test", memberships: [membership({ org_slug: "northway" })] }),
    );
    mockFetchInvitation.mockResolvedValue(preview({ requires_sign_in: true }));
    mockAccept.mockResolvedValue({ org_slug: "acme-motors", account_created: false });

    const { router } = renderRoute({ path: PATH });

    fireEvent.click(await screen.findByRole("button", { name: /Join Acme Motors/ }));

    // No password: they already have one, and it is not changed by joining.
    await waitFor(() => {
      expect(mockAccept).toHaveBeenCalledWith(TOKEN, {});
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/acme-motors");
    });
  });

  it("shows no password form while it is still finding out who is signed in", async () => {
    /*
     * FOUND IN A BROWSER, NOT BY A TEST, which is why it is pinned here now.
     *
     * `/me` is a request like any other. Until it answers, `me` is undefined
     * and the screen was falling through to the LAST branch -- the password
     * form -- so an admin opening somebody else's link got a flash of "Choose
     * a password" before it corrected itself. The accept would have been
     * refused by the server, but only after they had typed one.
     *
     * The invitation resolves immediately here and `/me` is held open, which
     * is the real ordering: the two requests race and this one lost.
     */
    mockFetchInvitation.mockResolvedValue(preview());

    let signIn: (value: Awaited<ReturnType<typeof fetchMe>>) => void = () => {};
    mockFetchMe.mockReturnValue(
      new Promise((resolve) => {
        signIn = resolve;
      }),
    );

    renderRoute({ path: PATH });

    /*
     * WAIT FOR THE LOADING STATE TO SURVIVE, rather than asserting the form is
     * absent the moment the fetch was called. Written that way first, it
     * passed with the fix reverted: the assertion ran before React had
     * rendered the resolved invitation at all, so "no password field" was true
     * for the wrong reason. Pinning the "One moment." status is what makes the
     * two versions of this screen behave differently here.
     */
    await waitFor(() => {
      expect(mockFetchInvitation).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByRole("status")).toHaveTextContent("One moment.");
    expect(screen.queryByLabelText("Choose a password")).not.toBeInTheDocument();

    signIn(me({ email: "rahul@acme.test", memberships: [membership()] }));

    // ...and once it has, the right state is the FIRST one rendered.
    expect(
      await screen.findByRole("heading", { name: "This invitation is for someone else" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose a password")).not.toBeInTheDocument();
  });

  it("refuses when the invitation is for a different address, and says both", async () => {
    /*
     * THE CASE THAT MATTERS MOST. An admin checking the link would otherwise
     * claim somebody else's invitation on their own account — it would work,
     * spend the invitation, and leave no trace of what happened.
     */
    mockFetchMe.mockResolvedValue(
      me({ email: "rahul@acme.test", memberships: [membership()] }),
    );
    mockFetchInvitation.mockResolvedValue(preview());

    renderRoute({ path: PATH });

    expect(
      await screen.findByRole("heading", { name: "This invitation is for someone else" }),
    ).toBeInTheDocument();
    // BOTH ADDRESSES IN ONE SENTENCE. "Wrong account" alone does not tell
    // somebody which of their accounts to use, which is the whole reason this
    // state exists rather than a generic refusal.
    expect(
      screen.getByText(
        /It was sent to priya@acme.test, and you are signed in as rahul@acme.test/,
      ),
    ).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /Join/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Choose a password")).not.toBeInTheDocument();
  });
});

describe("links that cannot be used", () => {
  it("explains an expired one and who can fix it", async () => {
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview({ is_expired: true }));

    renderRoute({ path: PATH });

    expect(
      await screen.findByRole("heading", { name: "This invitation has expired" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ask Rahul K to send a new link/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose a password")).not.toBeInTheDocument();
  });

  it("tells somebody who has already accepted to sign in", async () => {
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview({ is_accepted: true }));

    renderRoute({ path: PATH });

    expect(
      await screen.findByRole("heading", { name: "You have already joined" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toBeInTheDocument();
  });

  it("says nothing about WHY an unknown token is unknown", async () => {
    /*
     * A token that was never minted and one that was cancelled have to look
     * the same, or this page becomes a way to ask which tokens are live.
     */
    signedOut();
    mockFetchInvitation.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "Invitation not found.",
        code: "not_found",
        trace_id: "test",
      }),
    );

    renderRoute({ path: PATH });

    expect(
      await screen.findByRole("heading", { name: "This link is not valid" }),
    ).toBeInTheDocument();
  });

  it("does not retry a 404 three times before explaining", async () => {
    signedOut();
    mockFetchInvitation.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "Invitation not found.",
        code: "not_found",
        trace_id: "test",
      }),
    );

    renderRoute({ path: PATH });

    await screen.findByRole("heading", { name: "This link is not valid" });
    expect(mockFetchInvitation).toHaveBeenCalledTimes(1);
  });
});
