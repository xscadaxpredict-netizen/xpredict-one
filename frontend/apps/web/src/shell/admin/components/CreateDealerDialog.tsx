/**
 * Open a new dealership.
 *
 * ONE FIELD, AND THAT IS DELIBERATE. A dealership needs a name to exist;
 * address, GST number, contact and opening hours are all things somebody can
 * fill in afterwards, and none of them should stand between an organisation
 * and getting its second branch on the system. The backend model for those
 * fields does not exist yet either, so asking for them now would be inventing
 * a schema from a form.
 *
 * Creating a dealer is an organisation-level act (C3): the org opens and
 * closes dealerships, and each one then manages its own people.
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
import { useCreateDealer } from "../hooks/useDealers";
import styles from "./CreateDealerDialog.module.css";

const dealerSchema = z.object({
  name: z
    .string()
    .min(1, "Enter a name for this dealership.")
    .max(80, "Keep the name under 80 characters."),
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
            it was closed.
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DealerFields>({
    resolver: zodResolver(dealerSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: DealerFields) {
    setFormError(null);

    try {
      await create(values);
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

      {formError && <FormBanner traceId={formError.traceId}>{formError.message}</FormBanner>}

      <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <TextField
          label="Name"
          autoFocus
          placeholder="Chennai — Guindy"
          // Says what a good name looks like without making it a rule. City
          // and branch is what people say out loud, and the name appears in
          // every scope picker from here on.
          error={errors.name?.message}
          {...register("name")}
        />

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
