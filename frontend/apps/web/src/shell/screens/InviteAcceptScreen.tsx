/**
 * Join an organisation from an invitation link (C56).
 *
 * THE LINK ARRIVES BY HAND. There is no email transport: an admin copies the
 * link and sends it over whatever they already use. So this screen is the
 * first thing a new colleague ever sees of the product, and it is opened by
 * somebody who may have no idea what Xpredict One is — which is why it names
 * the organisation and the inviter before asking for anything.
 *
 * SIX STATES, and they are all reachable. Four of them are dead ends that
 * exist so nobody meets a blank page:
 *
 *   1. the token is unknown            -> 404, nothing to say but so
 *   2. already accepted                -> sign in instead
 *   3. expired                         -> ask for a new link
 *   4. signed in as the wrong person   -> say who, offer to sign out
 *   5. the address already has an account -> sign in, then one button
 *   6. nobody has this address yet     -> choose a password
 *
 * State 5 is NOT an edge case. One login spans organisations (C1, C27), so
 * anybody already working somewhere else on the platform arrives here with an
 * account — and a link that could set a password on an existing account would
 * be a password reset with no proof of who is holding it, which is the thing
 * Q23 refuses from the admin side too.
 */

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { asProblem, hasFieldErrors } from "@xpredict/api-client";

import { messagesByField } from "../fieldErrors";
import { PASSWORD_HINT, passwordField } from "../passwordRules";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormBanner } from "../components/FormBanner";
import { TextField } from "../components/TextField";
import { useLogout, useMe } from "../hooks/useAuth";
import { useAcceptInvitation, useInvitation } from "../hooks/useInvitation";
import styles from "./InviteAcceptScreen.module.css";

/*
 * 8 characters, matching the sign-in form and Django's own
 * MinimumLengthValidator. The server is what enforces the rest of
 * AUTH_PASSWORD_VALIDATORS — "too common", "entirely numeric" — and its
 * answers arrive as a banner, because only it can judge them.
 */
const acceptFormSchema = z
  .object({
    password: passwordField("Password must be at least 8 characters."),
    confirm: z.string().min(1, "Type your password again."),
  })
  .refine((values) => values.password === values.confirm, {
    path: ["confirm"],
    message: "Both passwords must match.",
  });

type AcceptFormFields = z.infer<typeof acceptFormSchema>;

export function InviteAcceptScreen() {
  const { token = "" } = useParams<{ token: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: invitation, isPending: loadingInvitation, error: loadError } = useInvitation(token);

  /*
   * WAITED FOR, not just read. Which of the six states this screen is in
   * depends on WHO IS SIGNED IN as much as on the invitation, so rendering
   * before `/me` has answered picks a state from incomplete information --
   * and the one it picks is the password form, because `me` is undefined
   * while the request is in flight.
   *
   * Found in a browser, not by a test: an admin signed in as themselves
   * opened somebody else's link and got a flash of "Choose a password" before
   * the screen corrected itself. Harmless in the end -- the server refuses an
   * accept by the wrong account -- but it invites somebody to start typing
   * into a form that is about to vanish, and the refusal they would get makes
   * no sense from where they are sitting.
   *
   * A signed-out visitor costs nothing here: `/me` answers 401 immediately and
   * the two requests are in flight together.
   */
  const { data: me, isPending: loadingMe } = useMe();
  const isPending = loadingInvitation || loadingMe;
  const { mutateAsync: accept, isPending: accepting } = useAcceptInvitation(token);
  const { mutate: signOut, isPending: signingOut } = useLogout();

  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AcceptFormFields>({
    resolver: zodResolver(acceptFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  async function join(body: { password?: string }) {
    setFormError(null);

    try {
      const result = await accept(body);
      /*
       * To the launcher, not into an app (C15) — which apps they can open is
       * the server's answer and they have only just become somebody who can
       * ask. `replace`, so Back does not return to a link that is now spent.
       */
      void navigate(`/${result.org_slug}`, { replace: true });
    } catch (caught) {
      const problem = asProblem(caught);

      /*
       * THE REASON IS IN `errors`, NOT IN `detail`.
       *
       * `config/exception_handler.py` gives every validation failure the same
       * generic detail and puts the specifics in `errors` — so this screen
       * showed "The submitted data is not valid." while the response was
       * carrying "This password is too common. This password is entirely
       * numeric." A refused password read as though the form itself were
       * broken, which is how it was reported.
       *
       * Only `password` can be placed: `confirm` exists in this form and not
       * on the server, and nothing else here is a field. Anything the server
       * names that this form does not have goes to the banner rather than
       * being attached to a field that does not exist and rendering nowhere —
       * the silent failure `SignupScreen` already learned about.
       */
      if (hasFieldErrors(problem)) {
        const byField = messagesByField(problem.errors);
        const passwordMessage = byField.get("password");

        if (passwordMessage) {
          setError("password", { message: passwordMessage });
          byField.delete("password");
        }

        const unplaceable = [...byField.values()];
        if (unplaceable.length > 0) {
          setFormError({ message: unplaceable.join(" ") });
        } else if (!passwordMessage) {
          setFormError({ message: problem.detail });
        }
        return;
      }

      setFormError({
        message: problem.detail,
        traceId: problem.status >= 500 ? problem.trace_id : undefined,
      });
    }
  }

  if (isPending) {
    return (
      <AuthLayout title="Checking your invitation…">
        <p className={styles.note} role="status">
          One moment.
        </p>
      </AuthLayout>
    );
  }

  /*
   * An unknown token. Deliberately vague about WHY — a link that was never
   * minted and one that was deleted have to look the same, or this page
   * becomes a way to ask which tokens are live.
   */
  if (loadError || !invitation) {
    return (
      <DeadEnd
        title="This link is not valid"
        body="It may have been cancelled, or copied incompletely. Ask whoever invited you for a new one."
      />
    );
  }

  if (invitation.is_accepted) {
    return (
      <DeadEnd
        title="You have already joined"
        body={`This invitation to ${invitation.organization_name} has been accepted. Sign in with ${invitation.email}.`}
      />
    );
  }

  if (invitation.is_expired) {
    return (
      <DeadEnd
        title="This invitation has expired"
        body={`Ask ${invitation.invited_by || "whoever invited you"} to send a new link — it takes them one click.`}
      />
    );
  }

  /*
   * Signed in as somebody else. THE LIKELY CASE IS COMPLETELY INNOCENT: an
   * admin pastes the link to check that it works, while signed in as
   * themselves. Accepting on their account would add the wrong person and
   * spend the invitation, so the server refuses — and this says so before they
   * press anything.
   */
  if (me && me.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <AuthLayout
        title="This invitation is for someone else"
        subtitle={`It was sent to ${invitation.email}, and you are signed in as ${me.email}.`}
      >
        <p className={styles.note}>
          If {invitation.email} is you, sign out and open the link again.
        </p>

        <Button type="button" isLoading={signingOut} onClick={() => signOut()}>
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </AuthLayout>
    );
  }

  // Signed in as the invited person: nothing to ask, one button.
  if (me) {
    return (
      <AuthLayout
        title={`Join ${invitation.organization_name}`}
        subtitle={`${invitation.invited_by || "An administrator"} invited you.`}
      >
        {formError && <FormBanner traceId={formError.traceId}>{formError.message}</FormBanner>}

        <p className={styles.note}>
          You are signed in as {me.email}. Joining adds {invitation.organization_name} to your
          account — you keep everything you already have.
        </p>

        <Button type="button" isLoading={accepting} onClick={() => void join({})}>
          {accepting ? "Joining…" : `Join ${invitation.organization_name}`}
        </Button>
      </AuthLayout>
    );
  }

  /*
   * The address already has an account and nobody is signed in. They sign in
   * first and come back; `state.from` is how `RedirectIfSignedIn` returns
   * somebody to where they were, so the link survives the detour.
   */
  if (invitation.requires_sign_in) {
    return (
      <AuthLayout
        title={`Join ${invitation.organization_name}`}
        subtitle={`${invitation.email} already has an Xpredict One account.`}
      >
        <p className={styles.note}>
          Sign in and you will come straight back here to accept. Your password is the one you
          already use — nobody can change it from a link.
        </p>

        <Link className={styles.action} to="/login" state={{ from: location.pathname }}>
          Sign in to accept
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Join ${invitation.organization_name}`}
      subtitle={`${invitation.invited_by || "An administrator"} invited ${invitation.email}.`}
      footer={<>Not expecting this? Ignore the link and it expires on its own.</>}
    >
      {formError && <FormBanner traceId={formError.traceId}>{formError.message}</FormBanner>}

      <p className={styles.note}>Choose a password and you are in.</p>

      {/* noValidate hands validation to Zod, so the wording is ours rather
          than each browser's own. */}
      <form
        className={styles.form}
        onSubmit={(e) => void handleSubmit((values) => join({ password: values.password }))(e)}
        noValidate
      >
        {/*
          The address is shown and NOT editable. It is what the invitation was
          issued for and what they will sign in with; letting it be changed
          here would mean accepting an invitation as somebody else.
        */}
        <TextField label="Email" type="email" value={invitation.email} readOnly disabled />

        <TextField
          label="Choose a password"
          type="password"
          autoComplete="new-password"
          autoFocus
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          {...register("password")}
        />

        <TextField
          label="Type it again"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register("confirm")}
        />

        <Button type="submit" isLoading={accepting}>
          {accepting ? "Joining…" : `Join ${invitation.organization_name}`}
        </Button>
      </form>
    </AuthLayout>
  );
}

/**
 * The four states somebody can do nothing about from here.
 *
 * Each one ends with what to do next rather than only what went wrong — the
 * person reading it has no idea how any of this works and did not choose to be
 * here.
 */
function DeadEnd({ title, body }: { title: string; body: string }) {
  return (
    <AuthLayout title={title}>
      <p className={styles.note}>{body}</p>
      <Link className={styles.action} to="/login">
        Go to sign in
      </Link>
    </AuthLayout>
  );
}

/**
 * Keeps a signed-in person's own invitation link working.
 *
 * Nothing wraps this route in `RedirectIfSignedIn` — that guard would bounce
 * anybody already signed in straight to their launcher, which is exactly what
 * must NOT happen to somebody holding an invitation to a second organisation
 * (C1). The screen handles every signed-in case itself.
 */
export function InviteAcceptRoute() {
  const { token } = useParams<{ token: string }>();

  // A route with no token cannot happen through the router, but a hand-typed
  // `/invite/` can — and it would otherwise fetch `/api/v1/invitations//`.
  if (!token) return <Navigate to="/login" replace />;

  return <InviteAcceptScreen />;
}
