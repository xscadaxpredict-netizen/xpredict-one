/**
 * The dealership form. Used to create one and to edit one.
 *
 * SHARED BECAUSE NINE FIELDS IS TOO MANY TO MAINTAIN TWICE. Two copies means
 * a validation rule tightened on one and not the other, and the one that gets
 * forgotten is always edit — it is used less, so the drift shows up months
 * later on somebody correcting a typo.
 *
 * Three groups, in the order somebody actually knows the answers: what the
 * dealership is, who to contact, where it is.
 *
 * MANDATORY IS MARKED, NOT ENFORCED BY THE BROWSER. The form sets
 * `noValidate` so the messages are ours and consistent rather than each
 * browser's own wording; `required` on the input is for assistive tech, which
 * announces it, and Zod produces what the person reads.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import type { Dealer, DealerDetails } from "../api/dealers";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { TextField } from "../../components/TextField";
import styles from "./DealerForm.module.css";

/*
 * Deliberately permissive on phone and postcode.
 *
 * These are catching typos, not deciding what a valid Indian mobile or a valid
 * PIN code looks like — a pattern tight enough to be useful for one country
 * rejects a legitimate number from the next one, and the rejection lands on
 * somebody who cannot do anything about it. The backend, which knows the
 * market, can be stricter.
 */
const PHONE_CHARACTERS = /^[\d+()\-\s]+$/;
const POSTAL_CODE = /^[A-Za-z0-9][A-Za-z0-9\s-]{2,11}$/;

const dealerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for this dealership.")
    .max(80, "Keep the name under 80 characters."),

  code: z
    .string()
    .trim()
    .max(16, "Keep the code under 16 characters.")
    .regex(/^[A-Za-z0-9-]*$/, "Use letters, numbers and hyphens only."),

  contact_person: z
    .string()
    .trim()
    .min(1, "Enter the person to contact at this dealership.")
    .max(80, "Keep the name under 80 characters."),

  email: z
    .string()
    .trim()
    .min(1, "Enter a registered email address.")
    .email("Enter a valid email address."),

  phone: z
    .string()
    .trim()
    .min(1, "Enter a phone number.")
    .regex(PHONE_CHARACTERS, "Use digits, spaces, brackets, + and - only.")
    .refine(
      (value) => (value.match(/\d/g)?.length ?? 0) >= 7,
      "That does not look like enough digits for a phone number.",
    ),

  city: z.string().trim().min(1, "Enter a city."),
  state: z.string().trim().min(1, "Enter a state."),

  postal_code: z
    .string()
    .trim()
    .min(1, "Enter a postal or ZIP code.")
    .regex(POSTAL_CODE, "Enter a valid postal or ZIP code."),
});

export type DealerFields = z.infer<typeof dealerSchema>;

/** An existing dealership as form values. Nulls become empty strings. */
export function dealerToFields(dealer: Dealer): DealerFields {
  return {
    name: dealer.name,
    code: dealer.code ?? "",
    contact_person: dealer.contact_person,
    email: dealer.email,
    phone: dealer.phone,
    city: dealer.city,
    state: dealer.state,
    postal_code: dealer.postal_code,
  };
}

export const EMPTY_DEALER_FIELDS: DealerFields = {
  name: "",
  code: "",
  contact_person: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  postal_code: "",
};

interface DealerFormProps {
  defaultValues: DealerFields;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  /** Throws on failure; the banner below is what the person sees. */
  onSubmit: (details: DealerDetails) => Promise<void>;
}

export function DealerForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  isPending,
  onSubmit,
}: DealerFormProps) {
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DealerFields>({
    resolver: zodResolver(dealerSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues,
  });

  async function submit(values: DealerFields) {
    setFormError(null);

    try {
      await onSubmit({
        ...values,
        // Empty means "not given". Sending "" would store a blank code that
        // then collides with the next blank one on a uniqueness check.
        code: values.code || null,
      });
    } catch (error) {
      const problem = asProblem(error);
      setFormError({
        message: problem.detail,
        // Only worth showing for a fault at our end. On a 409 the message
        // already says what to do, and a trace id would just be noise.
        traceId: problem.status >= 500 ? problem.trace_id : undefined,
      });
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(submit)(e)} noValidate>
      {/* Scrolls; the actions below do not, so the submit button never leaves
          the screen no matter how far down the form you are. */}
      <div className={styles.body}>
        {formError && <FormBanner traceId={formError.traceId}>{formError.message}</FormBanner>}

        <fieldset className={styles.section}>
          <legend className={styles.legend}>Business identity</legend>

          <TextField
            label="Dealership name"
            required
            autoFocus
            placeholder="Chennai — Guindy"
            error={errors.name?.message}
            {...register("name")}
          />

          <div className={styles.pair}>
            <TextField
              label="Unique code"
              placeholder="CHN-GUI"
              error={errors.code?.message}
              {...register("code")}
            />
          </div>

          <p className={styles.hint}>The code is optional but must be unique.</p>
        </fieldset>

        <fieldset className={styles.section}>
          <legend className={styles.legend}>Contact</legend>

          <TextField
            label="Contact person"
            required
            placeholder="Anita Fernandes"
            error={errors.contact_person?.message}
            {...register("contact_person")}
          />

          <div className={styles.pair}>
            <TextField
              label="Registered email"
              type="email"
              required
              placeholder="guindy@acmemotors.in"
              error={errors.email?.message}
              {...register("email")}
            />

            <TextField
              label="Mobile / phone"
              type="tel"
              required
              placeholder="+91 44 2345 6789"
              error={errors.phone?.message}
              {...register("phone")}
            />
          </div>

          <p className={styles.hint}>
            Where correspondence for this dealership goes. It does not have to be
            anybody&rsquo;s sign-in address.
          </p>
        </fieldset>

        <fieldset className={styles.section}>
          <legend className={styles.legend}>Address</legend>

          <div className={styles.pair}>
            <TextField
              label="City"
              required
              placeholder="Chennai"
              error={errors.city?.message}
              {...register("city")}
            />

            <TextField
              label="State"
              required
              placeholder="Tamil Nadu"
              error={errors.state?.message}
              {...register("state")}
            />
          </div>

          <TextField
            label="Postal / ZIP code"
            required
            placeholder="600032"
            error={errors.postal_code?.message}
            {...register("postal_code")}
          />
        </fieldset>
      </div>

      <div className={styles.actions}>
        <Dialog.Close asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Dialog.Close>

        <Button type="submit" isLoading={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
