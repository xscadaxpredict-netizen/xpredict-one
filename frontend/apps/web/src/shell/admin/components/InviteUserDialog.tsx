/**
 * Invite someone into the organisation.
 *
 * NOT "create a user". Nobody here sets somebody else's password (C14):
 * an invitation goes out, the person accepts it and chooses their own
 * credentials. That is why the new row appears as "Invitation sent" rather
 * than active, and why there is no password field on this form.
 *
 * SCOPE IS THE INTERESTING FIELD, and it constrains the apps as much as they
 * constrain it. A person belongs to the organisation; the only product that can
 * narrow that is DMS, because it is the only unit-aware one (C5). So the picker
 * is off unless DMS is selected, and says why — rather than silently accepting a
 * dealer that would mean nothing in CRM.
 *
 * And the other direction, which is C27: a dealer-scoped person cannot hold an
 * organisation-wide product at all, so choosing a dealer locks those apps. Both
 * halves of that rule live in `../dealerScope.ts`, shared with the edit form.
 *
 * ROLES ARE NOT SET HERE. Q11 and Q12 are open, so a role dropdown would be
 * the frontend inventing a vocabulary the backend has not agreed. Access is
 * granted per app now; roles land when those questions are answered.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import type { Membership } from "../../api/auth";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { TextField } from "../../components/TextField";
import { PersonAccessFields, usePersonAccess } from "./PersonAccessFields";
import { useInviteUser } from "../hooks/useUsers";
import styles from "./InviteUserDialog.module.css";

const inviteSchema = z.object({
  first_name: z.string().min(1, "Enter a first name."),
  last_name: z.string().min(1, "Enter a last name."),
  email: z.string().min(1, "Enter an email address.").email("Enter a valid email address."),
});

type InviteFields = z.infer<typeof inviteSchema>;

interface InviteUserDialogProps {
  membership: Membership;
  /**
   * Open straight away, scoped to this dealership.
   *
   * Arrives from `?invite=<id>`, which a dealership with nobody in it links to.
   * Creating a dealership and then hunting for the way to staff it was a dead
   * end — the Dealers screen knew what was missing and could not say so.
   *
   * It opens the SAME dialog rather than a second invite form. C23's warning
   * was about two screens creating the same kind of record and then disagreeing
   * about the rules; a prefilled shortcut into this one is not that.
   */
  openForUnitId?: string | null;
}

export function InviteUserDialog({ membership, openForUnitId }: InviteUserDialogProps) {
  const [open, setOpen] = useState(openForUnitId != null);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.trigger}>
        <PlusIcon />
        Invite user
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          {/*
            Remounted each time it opens, via `key`. Without it the form keeps
            whatever was typed and whichever error was showing the last time
            it was closed, and reopening looks like a half-finished action you
            do not remember starting.
          */}
          <InviteForm
            key={String(open)}
            membership={membership}
            initialUnitId={openForUnitId}
            onDone={() => setOpen(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface InviteFormProps {
  membership: Membership;
  /** Seeds the scope when the form was opened from a specific dealership. */
  initialUnitId?: string | null;
  onDone: () => void;
}

function InviteForm({ membership, initialUnitId, onDone }: InviteFormProps) {
  /*
   * SCOPE, APPS AND ROLES ALL LIVE IN `usePersonAccess` — the same hook the
   * edit dialog uses, so the two forms cannot drift apart again. C30 set this
   * shape and recorded that the edit form "keeps the older layout"; it does
   * not any more.
   *
   * What stays here is what is genuinely an invitation: the name and address
   * of somebody who does not exist yet, and sending it.
   */
  const access = usePersonAccess({
    membership,
    // Seeded when the form was opened from a dealership with nobody in it
    // (C30's `?invite=<dealerId>`). Everything else starts blank.
    initial: initialUnitId ? { unitId: initialUnitId, apps: [], orgRole: "member" } : undefined,
  });

  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(
    null,
  );
  const { mutateAsync: invite, isPending } = useInviteUser();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteFields>({
    resolver: zodResolver(inviteSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: InviteFields) {
    setFormError(null);

    /*
     * ONE VALIDATION CALL, and the hook owns what it means. It covers a
     * dealership branch chosen and not answered, and an app granted with no
     * role — a grant with no role is access to an app with no permissions
     * inside it, which reads as a bug rather than a decision.
     */
    const problem = access.problem();
    if (problem) {
      setFormError({ message: problem });
      return;
    }

    try {
      await invite({ ...values, ...access.payload() });
      onDone();
    } catch (error) {
      const asproblem = asProblem(error);
      setFormError({
        message: asproblem.detail,
        // Only worth showing for a fault at our end. On a 409 the message
        // already says what to do, and a trace id would just be noise.
        traceId: asproblem.status >= 500 ? asproblem.trace_id : undefined,
      });
    }
  }

  return (
    <>
      <div className={styles.header}>
        <Dialog.Title className={styles.title}>Invite user</Dialog.Title>
        <Dialog.Description className={styles.description}>
          They join {access.callerIsUnitScoped ? membership.unit_name : membership.org_name} and choose
          their own password from the emailed invitation.
        </Dialog.Description>
      </div>

      {formError && <FormBanner traceId={formError.traceId}>{formError.message}</FormBanner>}

      <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <div className={styles.nameRow}>
          <TextField label="First name" autoFocus error={errors.first_name?.message} {...register("first_name")} />
          <TextField label="Last name" error={errors.last_name?.message} {...register("last_name")} />
        </div>

        <TextField
          label="Email"
          type="email"
          placeholder="name@company.com"
          error={errors.email?.message}
          {...register("email")}
        />

        <PersonAccessFields
          access={access}
          membership={membership}
          scopeHint={`Whether this person works across ${membership.org_name} or for a single dealer.`}
        />

        <div className={styles.actions}>
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Dialog.Close>

          <Button type="submit" isLoading={isPending}>
            {isPending ? "Sending…" : "Send invitation"}
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
