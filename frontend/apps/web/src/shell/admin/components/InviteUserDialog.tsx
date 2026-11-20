/**
 * Invite someone into the organisation.
 *
 * NOT "create a user". Nobody here sets somebody else's password (C14):
 * an invitation is created, the person accepts it and chooses their own
 * credentials. That is why the new row appears as "Invitation sent" rather
 * than active, and why there is no password field on this form.
 *
 * NOTHING IS EMAILED (C56). Submitting this form ends with a LINK, shown on
 * the step after the form, which the admin copies and sends however they
 * already talk to the person. The dialog therefore does not close on success
 * -- closing it would throw away the only thing the action produced.
 *
 * A PERSON AND NOTHING ELSE (C83, the owner 2026-11-20, as Zoho's admin
 * panel): first name, last name, email. No role, no dealership, no apps -- the
 * Admin panel invites a person, and apps are assigned afterwards (Assign app,
 * or Edit). An APP's own invite, built with that app's Users screen, will ask
 * for that app's role. A person with no app joins able to open nothing yet,
 * and the launcher tells them so.
 *
 * ORGANISATION-WIDE ADMINS ONLY, for now: an invited person sits nowhere, so
 * the server refuses a dealer admin (C82 redesigns places per app), and the
 * Users screen does not offer them this button.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import type { Membership } from "../../api/auth";
import { InfoHint } from "@xpredict/ui";

import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { TextField } from "../../components/TextField";
import { InviteLinkPanel } from "./InviteLinkPanel";
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
}

export function InviteUserDialog({ membership }: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {/* "Add user", the Zoho word (the owner, 2026-11-17); what it does is
          invite them, which the dialog says. */}
      <Dialog.Trigger className={styles.trigger}>
        <PlusIcon />
        Add User
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        {/*
          `aria-describedby={undefined}` says the missing description is
          DELIBERATE. Radix warns when a dialog has no `Dialog.Description`,
          and it is right to: an unexplained dialog is a real failure. Here the
          explanation moved behind the info icon, which is a real <button> that
          Tab reaches and focus opens — so the prose is still reachable, it is
          simply no longer announced before anybody has asked for it.
        */}
        <Dialog.Content className={styles.dialog} aria-describedby={undefined}>
          {/*
            Remounted each time it opens, via `key`. Without it the form keeps
            whatever was typed and whichever error was showing the last time
            it was closed, and reopening looks like a half-finished action you
            do not remember starting.
          */}
          <InviteForm key={String(open)} membership={membership} onDone={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface InviteFormProps {
  membership: Membership;
  onDone: () => void;
}

function InviteForm({ membership, onDone }: InviteFormProps) {
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(
    null,
  );

  /*
   * Set once the invitation exists. It switches this dialog from a form into
   * the handover step -- the admin's job is not finished when the row is
   * created, it is finished when they have the link.
   */
  const [invited, setInvited] = useState<{ id: string; email: string } | null>(null);

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

    try {
      /*
       * The 201 carries the new row as the list would show it, so its `id` is
       * the invitation's -- which is what the link endpoint needs.
       */
      const created = await invite(values);
      setInvited({ id: created.id, email: created.email });
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

  if (invited) {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <Dialog.Title className={styles.title}>Invitation created</Dialog.Title>
            <InfoHint label="About this link">
              Nothing has been sent yet — Xpredict One does not email invitations. Anyone who
              opens this link joins as {invited.email}, so send it to them directly. Resend, on
              their record, replaces it.
            </InfoHint>
          </div>
        </div>

        <div className={styles.body}>
          {/*
            `version` is 0 and `isFresh` false: this link has just been created,
            so there is no earlier one to say has stopped working. Resend lives
            on the person's record, not here.
          */}
          <InviteLinkPanel userId={invited.id} email={invited.email} version={0} isFresh={false} />
        </div>

        <div className={styles.actions}>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Dialog.Title className={styles.title}>Invite user</Dialog.Title>
          {/*
            FOLDED BEHIND THE ICON, the way the three Administration screens
            already fold theirs. It explains a model somebody meets once; it is
            not an instruction for completing the form, which is what makes
            hiding it safe. It also buys back the height this dialog badly
            needs -- its content is 719px in a 515px box (C54).
          */}
          <InfoHint label="About inviting somebody">
            They join {membership.org_name} and choose their own password. Nothing is emailed:
            you get a link to send them yourself, and it stops working once they accept. They
            start with no apps — assign apps from their record.
          </InfoHint>
        </div>
      </div>

      <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        {/* Scrolls; the header above and the actions below do not, so the
            title stays visible and the submit button never leaves the screen. */}
        <div className={styles.body}>
          {formError && <FormBanner traceId={formError.traceId}>{formError.message}</FormBanner>}

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

        </div>

        <div className={styles.actions}>
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Dialog.Close>

          <Button type="submit" isLoading={isPending}>
            {isPending ? "Creating…" : "Create invitation"}
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
