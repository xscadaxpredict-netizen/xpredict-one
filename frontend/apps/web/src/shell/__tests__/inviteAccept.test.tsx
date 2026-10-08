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
import { fetchMe, login } from "../api/auth";
import type * as invitationsApi from "../api/invitations";
import { acceptInvitation, fetchInvitation, type InvitationPreview } from "../api/invitations";
import { renderRoute } from "./harness";
import { me, membership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  login: vi.fn(),
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
const mockLogin = vi.mocked(login);

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

  it("shows WHY a password was refused, not just that something was", async () => {
    /*
     * THE BUG THIS TEST EXISTS FOR, reported as "it says the given data is
     * invalid, why?".
     *
     * `config/exception_handler.py` gives every validation failure the same
     * generic `detail` and puts the real reasons in `errors`. This screen
     * rendered `detail` alone, so a refused password looked like a broken
     * form -- while the response was carrying two perfectly good sentences
     * explaining it.
     */
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview());
    mockAccept.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Unprocessable entity",
        status: 422,
        detail: "The submitted data is not valid.",
        code: "validation_failed",
        trace_id: "test",
        errors: [
          { field: "password", code: "invalid", detail: "This password is too common." },
          {
            field: "password",
            code: "invalid",
            detail: "This password is entirely numeric.",
          },
        ],
      }),
    );

    renderRoute({ path: PATH });

    fireEvent.change(await screen.findByLabelText("Choose a password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText("Type it again"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Join VRK|Join Acme Motors/ }));

    /*
     * BOTH REASONS, AGAINST THE FIELD. One at a time would mean fixing the
     * digits and only then being told it is also too common.
     */
    const message = await screen.findByText(
      "This password is too common. This password is entirely numeric.",
    );
    expect(message).toBeInTheDocument();

    // On the input, not in the banner: it is that field that is wrong.
    expect(screen.getByLabelText("Choose a password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("The submitted data is not valid.")).not.toBeInTheDocument();
  });

  it("states the password rules before anybody presses anything", async () => {
    /*
     * "Too common" cannot be checked in the browser, so without saying so up
     * front the only way to learn the rule is to break it.
     */
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview());

    renderRoute({ path: PATH });

    expect(
      await screen.findByText("At least 8 characters. Not a common password, and not all numbers."),
    ).toBeInTheDocument();
  });

  it("refuses an all-digit password without asking the server", async () => {
    signedOut();
    mockFetchInvitation.mockResolvedValue(preview());

    renderRoute({ path: PATH });

    fireEvent.change(await screen.findByLabelText("Choose a password"), {
      target: { value: "12345678" },
    });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /Join Acme Motors/ }));

    expect(
      await screen.findByText("Use something other than only numbers."),
    ).toBeInTheDocument();
    expect(mockAccept).not.toHaveBeenCalled();
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

describe("somebody who was removed and then re-invited", () => {
  /*
   * THE SEQUENCE NOBODY WOULD THINK TO CLICK THROUGH, and it was reported from
   * a real account: join, be removed, be invited again.
   *
   * Removing takes the MEMBERSHIP and leaves the account (C24), so she signs in
   * with zero memberships — which until C56 could only mean "you were removed".
   * It now also means "invited, not yet joined", and the two places that read
   * it the old way sent her nowhere and told her her access had been removed
   * while the invitation sat waiting.
   *
   * The backend was never the problem: signing in answers 200 and accepting
   * while signed in answers 201. Only the navigation was broken, which is why
   * these tests are about where she ENDS UP.
   */
  it("is carried back to the invitation after signing in, with no memberships", async () => {
    mockFetchInvitation.mockResolvedValue(preview({ requires_sign_in: true }));

    // Signed out, then signed in as somebody who belongs to nothing yet.
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
      .mockResolvedValue(me({ email: "priya@acme.test", memberships: [] }));
    mockLogin.mockResolvedValue(undefined);

    const { router } = renderRoute({ path: PATH });

    fireEvent.click(await screen.findByRole("link", { name: "Sign in to accept" }));

    /*
     * WAIT FOR THE SIGN-IN FORM, not for the router's pathname. The router
     * updates its location before React has rendered the new screen, so a test
     * that waits on the path and then queries immediately can run against an
     * empty document mid-transition.
     *
     * "Password" is the anchor because only this screen has one: the accept
     * form labels its fields "Choose a password" and "Type it again".
     */
    const password = await screen.findByLabelText("Password");

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "priya@acme.test" },
    });
    fireEvent.change(password, {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    // BACK TO THE INVITATION, not left on the form.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATH);
    });
    expect(await screen.findByRole("button", { name: /Join Acme Motors/ })).toBeInTheDocument();
  });

  it("is not told its access was removed while an invitation is waiting", async () => {
    /*
     * The sentence that made this look broken: a correct password answered
     * with "your access has been removed". It is not even true — she has an
     * invitation open.
     *
     * WATCHED WITH A MutationObserver, NOT ASSERTED AT THE END, and that is
     * the whole reason this test is worth anything. The redirect unmounts the
     * sign-in screen, so by the time the navigation has settled the message is
     * gone from the DOM whether or not it was ever shown — written the obvious
     * way, this passed with the fix reverted. The observer records every state
     * the document passed through, and without the fix it catches the message
     * appearing for a frame before the redirect.
     */
    mockFetchInvitation.mockResolvedValue(preview({ requires_sign_in: true }));
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
      .mockResolvedValue(me({ email: "priya@acme.test", memberships: [] }));
    mockLogin.mockResolvedValue(undefined);

    const { router } = renderRoute({ path: PATH });

    let everShown = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes("access has been removed")) {
        everShown = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    fireEvent.click(await screen.findByRole("link", { name: "Sign in to accept" }));

    const password = await screen.findByLabelText("Password");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "priya@acme.test" } });
    fireEvent.change(password, { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATH);
    });
    // A beat after the redirect, in case the message lands late rather than early.
    await new Promise((resolve) => setTimeout(resolve, 50));
    observer.disconnect();

    expect(everShown).toBe(false);
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
