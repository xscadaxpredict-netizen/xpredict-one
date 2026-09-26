/**
 * Open a new dealership.
 *
 * Three groups, in the order somebody actually knows the answers: what the
 * dealership is, who to contact, where it is. Nine fields is enough that
 * ungrouped they would read as a wall, and the groups are also the seams the
 * backend model will fall along.
 *
 * MANDATORY IS MARKED, NOT ENFORCED BY THE BROWSER. Every form here sets
 * `noValidate` so the messages are ours and consistent rather than each
 * browser's own wording; `required` on the input is there for assistive tech,
 * which announces it, and Zod produces what the person reads.
 *
 * Creating a dealer is an organisation-level act (C3): the organisation opens
 * and closes dealerships, and each one then manages its own people (C23).
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { TextField } from "../../components/TextField";
import { useCreateDealer, useDealers } from "../hooks/useDealers";
import styles from "./CreateDealerDialog.module.css";

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

  parent_id: z.string(),

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

type DealerFields = z.infer<typeof dealerSchema>;

export function CreateDealerDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.trigger}>
        <PlusIcon />
        Add dealer
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          {/*
            Remounted each time it opens, via `key`. Without it the form keeps
            whatever was typed and whichever error was showing the last time
            it was closed — which after nine fields is a lot to inherit.
          */}
          <CreateDealerForm key={String(open)} onDone={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CreateDealerForm({ onDone }: { onDone: () => void }) {
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);
  const { mutateAsync: create, isPending } = useCreateDealer();
  const { data: dealers } = useDealers();

  /*
   * Only open dealerships can be a parent. Hanging a new branch under one
   * that has closed creates something whose parent cannot act for it.
   */
  const possibleParents = dealers?.filter((dealer) => dealer.status === "active") ?? [];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DealerFields>({
    resolver: zodResolver(dealerSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: { parent_id: "", code: "" },
  });

  async function onSubmit(values: DealerFields) {
    setFormError(null);

    try {
      await create({
        ...values,
        // Empty means "not given". Sending "" would store a blank code that
        // then collides with the next blank one on a uniqueness check.
        code: values.code || null,
        parent_id: values.parent_id || null,
      });
      onDone();
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
    <>
      <div className={styles.header}>
        <Dialog.Title className={styles.title}>Add dealer</Dialog.Title>
        <Dialog.Description className={styles.description}>
          A dealership divides DMS only. People scoped to it see its records; CRM and the
          rest stay organisation-wide.
        </Dialog.Description>
      </div>

      <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
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
                // Optional, and said so rather than left to the absence of an
                // asterisk — the other eight fields make the asterisk the norm.
                error={errors.code?.message}
                {...register("code")}
              />

              <div className={styles.field}>
                <label className={styles.label} htmlFor="dealer-parent">
                  Parent dealership
                </label>
                <select
                  id="dealer-parent"
                  className={styles.select}
                  {...register("parent_id")}
                >
                  <option value="">None — top level</option>
                  {possibleParents.map((dealer) => (
                    <option key={dealer.id} value={dealer.id}>
                      {dealer.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className={styles.hint}>
              The code is optional but must be unique. Leave the parent empty unless this
              branch reports to another dealership.
            </p>
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
            {isPending ? "Adding…" : "Add dealer"}
          </Button>
        </div>
      </form>
    </>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path
        d="M7 2.5v9M2.5 7h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
