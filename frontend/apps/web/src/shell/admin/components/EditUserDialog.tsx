/**
 * Edit, from a person's ⋮ menu: their BASIC INFORMATION and nothing else
 * (the owner, 2026-11-20, as Zoho's).
 *
 *   first name, last name -- always. They belong to the person.
 *   email -- ONLY while their invitation is pending. Once they have joined it
 *            is how they sign in, and changing it from an admin screen is an
 *            account takeover with extra steps (C25). A typo on a pending
 *            invitation is a dead end, so that case can still be fixed.
 *
 * WHAT IS NOT HERE, ON PURPOSE: apps, roles, dealer and admin standing. Each
 * has its own action -- Assign applications, and the app tile's Edit |
 * Unassign and Assign Admin to come -- so fixing a spelling can never change
 * what somebody can open. The server refuses those fields if a stale screen
 * sends them.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import type { OrgUser } from "../api/users";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { TextField } from "../../components/TextField";
import { useUpdateUser } from "../hooks/useUsers";
import styles from "./EditUserDialog.module.css";

const editSchema = z.object({
  first_name: z.string().trim().min(1, "Enter a first name."),
  last_name: z.string().trim().min(1, "Enter a last name."),
  email: z.string().trim().min(1, "Enter an email address.").email("Enter a valid email address."),
});

type EditFields = z.infer<typeof editSchema>;

interface EditUserDialogProps {
  user: OrgUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          {/*
            `key` on the person AND on open: reopening starts from what is
            saved rather than from an abandoned edit.
          */}
          <EditUserForm
            key={`${user.id}-${String(open)}`}
            user={user}
            onDone={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditUserForm({ user, onDone }: { user: OrgUser; onDone: () => void }) {
  const isInvited = user.status === "invited";
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);
  const { mutateAsync: update, isPending } = useUpdateUser();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditFields>({
    resolver: zodResolver(editSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
    },
  });

  async function onSubmit(values: EditFields) {
    setFormError(null);
    try {
      await update({ userId: user.id, body: values });
      onDone();
    } catch (error) {
      const problem = asProblem(error);
      setFormError({
        message: problem.detail,
        traceId: problem.status >= 500 ? problem.trace_id : undefined,
      });
    }
  }

  return (
    <>
      <div className={styles.header}>
        <Dialog.Title className={styles.title}>Edit user</Dialog.Title>
        <Dialog.Description className={styles.description}>
          Their basic information. Apps and roles are on the Applications tab.
        </Dialog.Description>
      </div>

      <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <div className={styles.body}>
          {formError && <FormBanner traceId={formError.traceId}>{formError.message}</FormBanner>}

          <div className={styles.pair}>
            <TextField
              label="First name"
              required
              autoFocus
              error={errors.first_name?.message}
              {...register("first_name")}
            />
            <TextField
              label="Last name"
              required
              error={errors.last_name?.message}
              {...register("last_name")}
            />
          </div>

          <TextField
            label="Email"
            type="email"
            required
            // Locked once they have joined: this is how they sign in (C25).
            readOnly={!isInvited}
            aria-describedby="email-note"
            error={errors.email?.message}
            {...register("email")}
          />

          <p id="email-note" className={styles.hint}>
            {isInvited
              ? "They have not joined yet, so this can still be corrected."
              : "This is how they sign in, so it cannot be changed here."}
          </p>
        </div>

        <div className={styles.actions}>
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Dialog.Close>

          <Button type="submit" isLoading={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </>
  );
}
