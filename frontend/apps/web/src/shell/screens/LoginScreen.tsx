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
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import { fetchMe } from "../api/auth";
import { useLogin } from "../hooks/useAuth";
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
  const navigate = useNavigate();
  const { mutateAsync: signIn, isPending, } = useLogin();
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);
  const {register, handleSubmit, formState: { errors }, } = useForm<LoginFormFields>({
    resolver: zodResolver(loginFormSchema), 
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: LoginFormFields) {
    setFormError(null);

    try {
      await signIn(values);
      const me = await fetchMe();
      const first = me.memberships[0];

      if (!first) {
        setFormError({
          message: "Your access has been removed. Contact your administrator.",
        });
        return;
      }

      /*
       * No organisation picker (C13): straight to the first one. The topbar
       * switcher is how someone with several reaches the others.
       *
       * But NOT straight into an app. `/${slug}` is the launcher, because
       * which apps exist depends on the organisation's subscriptions and this
       * person's role — landing in DMS is only right for people who have DMS.
       */
      void navigate(`/${first.org_slug}`, { replace: true });
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
