/**
 * Create an organisation and its owner. Once per organisation (C14).
 *
 * Three steps rather than one long form. Making someone fill in organisation
 * name, their name, email and password and THEN telling them the activation
 * code is wrong is a poor first contact with the product — and this screen is
 * quite literally a customer's first contact with it.
 *
 * Everyone after the owner arrives by invitation. This screen is not the way
 * into an organisation that already exists.
 */

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import { toSlug } from "../api/signup";
import { messagesByField } from "../fieldErrors";
import {
  useCreateOrganisation,
  useProvisioningStatus,
  useValidateActivationCode,
} from "../hooks/useSignup";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormBanner } from "../components/FormBanner";
import { TextField } from "../components/TextField";
import { PASSWORD_HINT, passwordField } from "../passwordRules";
import {
  MAX_PROVISIONING_ATTEMPTS,
  provisioningState,
} from "./provisioningState";
import styles from "./SignupScreen.module.css";

type Step = "code" | "details" | "provisioning";

export function SignupScreen() {
  const [step, setStep] = useState<Step>("code");
  const [orgSlug, setOrgSlug] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  /*
   * Read the code from the URL DURING the first render, not in an effect.
   *
   * This bit me: effects run after render, and React Hook Form reads
   * `defaultValues` only on its first render. Setting the code from an effect
   * meant the form had already initialised empty — so the URL got scrubbed and
   * the code vanished with it, which is worse than not prefilling at all.
   *
   * The lazy initialiser below runs before the first render, so the form sees
   * the value. The effect then only has to clean the address bar.
   */
  const [code, setCode] = useState(() => searchParams.get("code") ?? "");
  const scrubbed = useRef(false);

  /*
   * Remove the code from the address bar. A secret in a URL ends up in browser
   * history, in server logs, and in the Referer header of the next outbound
   * request. Prefilling is convenient; leaving it there is careless.
   */
  useEffect(() => {
    if (scrubbed.current) return;
    if (!searchParams.has("code")) return;
    scrubbed.current = true;

    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete("code");
    setSearchParams(cleaned, { replace: true });
  }, [searchParams, setSearchParams]);

  if (step === "code") {
    return (
      <CodeStep
        initialCode={code}
        onValid={ (validCode) => { setCode(validCode); setStep("details"); } }
      />
    );
  }

  if (step === "details") {
    return (
      <DetailsStep
        code={code}
        onCreated={(slug) => {
          setOrgSlug(slug);
          setStep("provisioning");
        }}
        onBack={() => setStep("code")}
      />
    );
  }

  return <ProvisioningStep orgSlug={orgSlug} />;
}

/* -------------------------------------------------------------------------- */
/* Step 1 — the activation code                                               */
/* -------------------------------------------------------------------------- */

const codeSchema = z.object({
  code: z.string().min(1, "Enter your activation code."),
});

type CodeValues = z.infer<typeof codeSchema>;

function CodeStep({ initialCode, onValid, }: {
  initialCode: string;
  onValid: (code: string) => void;
}) {
  const { mutateAsync: validate, isPending } = useValidateActivationCode();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors }, } = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: initialCode },
  });

  async function onSubmit(values: CodeValues) {
    setError(null);
    try {
      await validate(values.code);
      onValid(values.code.trim());
    } catch (caught) {
      // Unlike login, these messages are deliberately specific. "Already used"
      // and "invalid" mean different things to someone your sales team handed
      // a code to, and being vague here only generates support calls.
      setError(asProblem(caught).detail);
    }
  }

  return (
    <AuthLayout
      title="Register your organisation"
      subtitle="Start with the activation code you were given."
      footer={
        <>
          Already have an account? <a href="/login">Sign in</a>
        </>
      }
    >
      {error && <FormBanner>{error}</FormBanner>}

      <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <TextField
          label="Activation code"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="XPRD-••••-••••"
          className={styles.codeInput}
          error={errors.code?.message}
          {...register("code")}
        />

        <Button type="submit" isLoading={isPending}>
          {isPending ? "Checking…" : "Continue"}
        </Button>
      </form>
    </AuthLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — the organisation and its owner                                    */
/* -------------------------------------------------------------------------- */

const detailsSchema = z.object({
  organisation_name: z.string().min(2, "Enter your organisation's name."),
  first_name: z.string().min(1, "Enter your first name."),
  last_name: z.string().min(1, "Enter your last name."),
  email: z.string().min(1, "Enter your email address.").email("Enter a valid email address."),
  /*
   * THE SAME RULES THE ACCEPT FORM STATES, from the same module, because the
   * server now applies the same validators to both (2026-10-08). Until then
   * signup called none at all, so a founder could register with `12345678`
   * while anybody they invited could not.
   */
  password: passwordField("Use at least 8 characters."),
});

type DetailsValues = z.infer<typeof detailsSchema>;

function DetailsStep({ code, onCreated, onBack, }: {
  code: string;
  onCreated: (orgSlug: string) => void;
  onBack: () => void;
}) {
  const { mutateAsync: create, isPending } = useCreateOrganisation();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState: { errors },
  } = useForm<DetailsValues>({ resolver: zodResolver(detailsSchema) });

  const orgName = watch("organisation_name") ?? "";
  const slugPreview = toSlug(orgName);

  async function onSubmit(values: DetailsValues) {
    setError(null);
    try {
      const result = await create({ code, details: values });
      onCreated(result.org_slug);
    } catch (caught) {
      const problem = asProblem(caught);

      // A taken email belongs against the field, not in a banner at the top —
      // that is where the person's eye already is, and where they must fix it.
      if (problem.code === "email_taken") {
        setFieldError("email", { message: problem.detail });
        return;
      }

      /*
       * Field errors the server found that the browser could not.
       *
       * CHECKED, NOT CAST. `field as keyof DetailsValues` was a lie told to the
       * compiler: the server names its own fields, and one this form does not
       * have — `activation_code` is the obvious candidate on this step —
       * attached the message to a field that does not exist. Nothing rendered.
       * The button stopped spinning and the screen did nothing at all, which
       * is the worst way for a form to fail.
       *
       * Anything unrecognised now falls through to the banner, so a message
       * the server bothered to send always reaches somebody.
       */
      if (problem.errors?.length) {
        const unplaceable: string[] = [];

        /*
         * GROUPED, NOT ASSIGNED ONE AT A TIME. A single field can fail several
         * validators at once -- `12345678` is both too common and entirely
         * numeric -- and this loop used to call `setFieldError` once per
         * message, leaving whichever arrived last. Somebody would fix the
         * numbers and only then be told it was also too common.
         *
         * It could not happen before 2026-10-08, because nothing on this
         * screen could produce two errors for one field until signup started
         * calling the password validators.
         */
        for (const [field, message] of messagesByField(problem.errors)) {
          if (isDetailsField(field)) {
            setFieldError(field, { message });
          } else {
            unplaceable.push(message);
          }
        }

        if (unplaceable.length === 0) return;

        setError(unplaceable.join(" "));
        return;
      }

      setError(problem.detail);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="You will be the owner of this organisation."
      footer={
        <button type="button" className={styles.backLink} onClick={onBack}>
          Use a different activation code
        </button>
      }
    >
      {error && <FormBanner>{error}</FormBanner>}

      <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <div>
          <TextField
            label="Organisation name"
            autoFocus
            autoComplete="organization"
            placeholder="Acme Motors"
            error={errors.organisation_name?.message}
            {...register("organisation_name")}
          />
          {/* Shown live because this lands in every URL they will ever use. */}
          {slugPreview && (
            <p className={styles.slugPreview}>
              Your workspace: <code>/{slugPreview}</code>
            </p>
          )}
        </div>

        <div className={styles.nameRow}>
          <TextField
            label="First name"
            autoComplete="given-name"
            error={errors.first_name?.message}
            {...register("first_name")}
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            error={errors.last_name?.message}
            {...register("last_name")}
          />
        </div>

        <TextField
          label="Work email"
          type="email"
          autoComplete="username"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register("email")}
        />

        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          {...register("password")}
        />

        <Button type="submit" isLoading={isPending}>
          {isPending ? "Creating…" : "Create organisation"}
        </Button>
      </form>
    </AuthLayout>
  );
}

/**
 * The fields this form actually has.
 *
 * Derived from the schema rather than written out again, so adding a field to
 * the form cannot leave this list behind — which would silently send its
 * server-side errors to the banner instead of the input.
 */
const DETAILS_FIELDS = new Set(Object.keys(detailsSchema.shape));

/**
 * How long to wait before admitting something is wrong.
 *
 * Generous on purpose — creating a database legitimately takes a few seconds
 * and a customer who is told it failed when it merely took eight seconds will
 * sign up twice.
 */
const PROVISIONING_TIMEOUT_MS = 30_000;

function isDetailsField(field: string): field is keyof DetailsValues {
  return DETAILS_FIELDS.has(field);
}

/* -------------------------------------------------------------------------- */
/* Step 3 — waiting for the tenant database                                   */
/* -------------------------------------------------------------------------- */

function ProvisioningStep({ orgSlug }: { orgSlug: string }) {
  const navigate = useNavigate();
  /*
   * `failureCount` was shown here and is deliberately gone. It counts failed
   * FETCHES, which is zero in the case that matters most: provisioning that
   * never finishes while the server cheerfully answers `is_ready: false` every
   * time. So it read "Attempts: 0", or was hidden entirely, exactly when
   * somebody most wanted a number. `attempt` below counts what the person
   * actually did.
   */
  const { data: isReady, isError, refetch } = useProvisioningStatus(orgSlug, Boolean(orgSlug));

  /*
   * Provisioning is asynchronous and usually quick, but "usually" is not a
   * plan. Without a ceiling a new customer sits here indefinitely, on the
   * first screen they ever see, with no retry and no way out — which is the
   * worst place in the product to dead-end.
   */
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isReady) return;

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, PROVISIONING_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [isReady, attempt]);

  useEffect(() => {
    if (isReady) {
      /*
       * The launcher, not DMS (C15). Which apps a new organisation has is the
       * server's answer, and landing the owner in one they may not have bought
       * meant the app-entitlement guard bounced them on their first screen.
       */
      void navigate(`/${orgSlug}`, { replace: true });
    }
  }, [isReady, orgSlug, navigate]);

  const state = provisioningState({ isError, timedOut, attempt });

  /*
   * THE TERMINAL STATE, and it deliberately does NOT redirect by itself.
   *
   * Yanking somebody to a sign-in form without explanation is the worse version
   * of this: they would arrive with no idea whether their organisation exists,
   * whether their payment counted, or whether to sign up again — and signing up
   * again is the one thing that cannot work, because the code is spent. So the
   * screen stops, says what is true, and offers exactly one way forward.
   *
   * "Try again" is REMOVED here rather than disabled. A greyed-out button is an
   * invitation to keep clicking something that will not help.
   */
  if (state === "exhausted") {
    return (
      <AuthLayout
        title="Your workspace is still not ready"
        subtitle="Your account and organisation exist. Nothing you entered is lost."
      >
        <div className={styles.provisioning} aria-live="polite">
          <p className={styles.provisioningNote}>
            We have tried {String(MAX_PROVISIONING_ATTEMPTS)} times and it has not finished.
            This needs somebody to look at it, so waiting here will not help.
          </p>

          <p className={styles.provisioningNote}>
            <strong>You do not need to sign up again</strong> — your activation code has
            already been used, and using it twice is not possible. Sign in with the email
            and password you just chose; if the workspace is ready by then you will go
            straight in.
          </p>

          <Button onClick={() => void navigate("/login", { replace: true })}>
            Go to sign in
          </Button>

          <p className={styles.provisioningNote}>
            If signing in does not work, contact support and quote{" "}
            <strong>{orgSlug}</strong>. That is the one thing they will ask for.
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (state === "retryable") {
    return (
      <AuthLayout
        title="This is taking longer than expected"
        subtitle="Your account exists. Its workspace is still being prepared."
      >
        <div className={styles.provisioning} aria-live="polite">
          <p className={styles.provisioningNote}>
            {isError
              ? "We lost contact while setting up your workspace."
              : "Setting up a workspace normally takes a few seconds."}{" "}
            Your organisation has been created and nothing is lost — you can try again, or
            sign in shortly and it will be ready.
          </p>

          <Button
            onClick={() => {
              /*
               * THE LAST PRESS GETS A REAL TRY. Clearing `timedOut` sends the
               * screen back to the progress bar for another full window, even
               * on the third press — so "exhausted" is reached when that third
               * attempt also fails, not the instant the button is clicked.
               *
               * The alternative reading is to give up immediately on the third
               * press, which shows the final message a window sooner and makes
               * that press do nothing. A button labelled "Try again" that does
               * not try is worse than half a minute of honest waiting.
               */
              setTimedOut(false);
              setAttempt((prevAttempt) => prevAttempt + 1);
              /*
               * Always refetch, not only on an error. When the server is
               * answering `false` the poll is still running, so a refetch is
               * strictly redundant — but a button labelled "Try again" that
               * sometimes sends no request is the kind of thing that wastes an
               * afternoon in the network tab. One request is cheaper than that
               * doubt.
               */
              void refetch();
            }}
          >
            Try again
          </Button>

          {/*
            A way off this screen that is not the browser's back button. Their
            account exists, so signing in is a genuine exit rather than a
            restart.
          */}
          <button
            type="button"
            className={styles.provisioningExit}
            onClick={() => void navigate("/login", { replace: true })}
          >
            Go to sign in
          </button>

          {attempt > 0 && (
            <p className={styles.provisioningNote}>
              Attempt {String(attempt)} of {String(MAX_PROVISIONING_ATTEMPTS)}.
            </p>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Setting up your workspace"
      subtitle="This takes a few seconds. Please do not close this page."
    >
      {/* aria-live so a screen reader is told what is happening, rather than
          sitting on a page that appears to have stopped. */}
      <div className={styles.provisioning} aria-live="polite">
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} />
        </div>
        <p className={styles.provisioningNote}>
          Your organisation gets its own database, which we are creating now.
        </p>
      </div>
    </AuthLayout>
  );
}
