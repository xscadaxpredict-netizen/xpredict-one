/**
 * Sign in.
 *
 * Read top to bottom this is: a schema, a form bound to it, a mutation, and a
 * decision about where to go afterwards. No business logic — the server decides
 * whether these credentials are good, and the server decides which
 * organisations this person belongs to.
 *
 * Two validation layers, doing different jobs:
 *   - Zod, in the browser: is this even shaped like an email? Instant, free,
 *     no request.
 *   - The server: are these credentials correct? Only it can know, and its
 *     answer arrives as a banner rather than against a field.
 */

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import { useLocation } from "react-router-dom";

import { useLogin } from "../hooks/useAuth";
import { returnPath, worksWithoutMembership } from "../returnPath";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormBanner } from "../components/FormBanner";
import { TextField } from "../components/TextField";
import styles from "./LoginScreen.module.css";

const loginFormSchema = z.object({
  email: z.string().min(1, "Enter your email address.").email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.")
});

type LoginFormFields = z.infer<typeof loginFormSchema>;

export function LoginScreen() {
  const { mutateAsync: signIn, isPending, } = useLogin();
  // The same return path `RedirectIfSignedIn` is about to act on, read through
  // the same validator so the two cannot disagree about what counts as one.
  const returnTo = returnPath(useLocation().state);
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);
  const {register, handleSubmit, formState: { errors }, } = useForm<LoginFormFields>({
    resolver: zodResolver(loginFormSchema), 
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: LoginFormFields) {
    setFormError(null);

    try {
      /*
       * `signIn` returns the fresh `/me` and puts it in the cache, so there is
       * one request and one copy of the answer.
       *
       * NO NAVIGATION HERE. `RedirectIfSignedIn` wraps this screen and sends
       * people on the moment `/me` resolves — including to the page they were
       * blocked from. This used to navigate as well and the two raced, with
       * the deep link surviving only when it happened to win.
       *
       * The one case the guard cannot handle is below: somebody with no
       * organisation has nowhere to be sent, so the guard leaves them here and
       * this screen explains why.
       */
      const me = await signIn(values);

      /*
       * UNLESS AN INVITATION IS WAITING. Zero memberships stopped meaning only
       * "you were removed" when invitations became acceptable (C56) — somebody
       * removed from their only organisation and re-invited signs in with none,
       * and the guard above is about to send them back to the invitation.
       *
       * Saying it anyway would put a false sentence on screen for the instant
       * before the redirect, and it is the sentence that made this look broken
       * when it was reported: correct password, "your access has been
       * removed", invitation sitting unopened.
       */
      const headingToInvitation =
        returnTo !== null && worksWithoutMembership(returnTo);

      if (me.memberships.length === 0 && !headingToInvitation) {
        setFormError({
          message: "Your access has been removed. Contact your administrator.",
        });
      }
    } catch (error) {
      const problem = asProblem(error);
      setFormError({
        message: problem.detail,
        traceId: problem.status >= 500 ? problem.trace_id : undefined,
      });
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the email your organisation invited."
      footer={
        <>
          Registering a new organisation? <a href="/signup">Use your activation code</a>
          <br />
          Joining an existing one? Your administrator invites you.
        </>
      }
    >
      {formError && <FormBanner traceId={formError.traceId}>{formError.message}</FormBanner>}

      {/* noValidate hands validation to Zod, so messages are ours and consistent
          rather than each browser's own wording. */}
      <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          placeholder="you@company.com"
          autoFocus
          error={errors.email?.message}
          {...register("email")}
        />

        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          action={
            <a href="/forgot-password" className={styles.forgot}>Forgot password?</a>
          }
          {...register("password")}
        />

        <Button type="submit" isLoading={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
