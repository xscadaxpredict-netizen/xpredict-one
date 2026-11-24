/**
 * Add User, on DMS settings -> Users (the owner, 2026-11-24; called "Add",
 * not "Invite", at the owner's word, as the Admin panel's): a person --
 * first name, last name, email -- and their DMS ROLE. Nothing about the app:
 * they are invited FROM DMS, so they get DMS ("since the user is getting
 * created in the app they will get the app in which they are created").
 *
 * THE ROLES ARE DMS'S ORGANISATION-LEVEL ONES (`invite-roles/`): an invitation
 * is placed at the organisation's root when accepted (C83), where a dealership
 * role is not legal -- so the picker offers only what the save will take.
 *
 * THE ADMIN PANEL'S ADD USER, plus a role: the same dialog styles, the same
 * fields, and the same ending -- nothing is emailed, the inviter gets the link
 * to send themselves (`InviteLinkPanel`, C56).
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";
import { InfoHint } from "@xpredict/ui";

import { Button } from "../../../shell/components/Button";
import { FormBanner } from "../../../shell/components/FormBanner";
import { TextField } from "../../../shell/components/TextField";
import { InviteLinkPanel } from "../../../shell/admin/components/InviteLinkPanel";
import dialogStyles from "../../../shell/admin/components/InviteUserDialog.module.css";
import pickerStyles from "../../../shell/admin/components/RolePicker.module.css";
import listStyles from "../../../shell/admin/screens/ListPage.module.css";
import { useDmsInviteRoles, useInviteDmsUser } from "./useDmsUsers";

const inviteSchema = z.object({
  first_name: z.string().min(1, "Enter a first name."),
  last_name: z.string().min(1, "Enter a last name."),
  email: z.string().min(1, "Enter an email address.").email("Enter a valid email address."),
  role: z.string().min(1, "Choose a role."),
});

type InviteFields = z.infer<typeof inviteSchema>;

interface AddDmsUserDialogProps {
  orgName: string;
}

export function AddDmsUserDialog({ orgName }: AddDmsUserDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={listStyles.primaryButton}>
        <PlusIcon />
        Add User
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={dialogStyles.overlay} />
        {/* The explanation is behind the ⓘ, as in Add User; the missing
            description is deliberate. */}
        <Dialog.Content className={dialogStyles.dialog} aria-describedby={undefined}>
          {/* Remounted each time it opens: no half-typed form from last time. */}
          <InviteForm key={String(open)} orgName={orgName} onDone={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface InviteFormProps {
  orgName: string;
  onDone: () => void;
}

function InviteForm({ orgName, onDone }: InviteFormProps) {
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(
    null,
  );
  const [invited, setInvited] = useState<{ id: string; email: string } | null>(null);

  const { data: roles, isPending: rolesLoading, isError: rolesFailed } = useDmsInviteRoles();
  const { mutateAsync: invite, isPending } = useInviteDmsUser();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<InviteFields>({
    resolver: zodResolver(inviteSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: { first_name: "", last_name: "", email: "", role: "" },
  });

  const chosen = roles?.find((role) => role.code === watch("role"));

  async function onSubmit(values: InviteFields) {
    setFormError(null);
    try {
      const created = await invite(values);
      setInvited({ id: created.id, email: created.email });
    } catch (error) {
      const problem = asProblem(error);
      setFormError({
        message: problem.detail,
        traceId: problem.status >= 500 ? problem.trace_id : undefined,
      });
    }
  }

  if (invited) {
    return (
      <>
        <div className={dialogStyles.header}>
          <div className={dialogStyles.titleRow}>
            <Dialog.Title className={dialogStyles.title}>User added</Dialog.Title>
            <InfoHint label="About this link">
              They are added as pending until they join. Nothing has been sent — Xpredict
              One does not email anyone. Anyone who opens this link joins as
              {invited.email}, so send it to them directly.
            </InfoHint>
          </div>
        </div>

        <div className={dialogStyles.body}>
          <InviteLinkPanel userId={invited.id} email={invited.email} version={0} isFresh={false} />
        </div>

        <div className={dialogStyles.actions}>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={dialogStyles.header}>
        <div className={dialogStyles.titleRow}>
          <Dialog.Title className={dialogStyles.title}>Add user</Dialog.Title>
          <InfoHint label="About adding somebody to DMS">
            They join {orgName} with DMS and the role you choose, and set their own password.
            Nothing is emailed: you get a link to send them, and they show as Pending until
            they join.
          </InfoHint>
        </div>
      </div>

      <form
        className={dialogStyles.form}
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
      >
        <div className={dialogStyles.body}>
          {formError && <FormBanner traceId={formError.traceId}>{formError.message}</FormBanner>}

          <div className={dialogStyles.nameRow}>
            <TextField
              label="First name"
              autoFocus
              error={errors.first_name?.message}
              {...register("first_name")}
            />
            <TextField label="Last name" error={errors.last_name?.message} {...register("last_name")} />
          </div>

          <TextField
            label="Email"
            type="email"
            placeholder="name@company.com"
            error={errors.email?.message}
            {...register("email")}
          />

          <div className={pickerStyles.field}>
            <label className={pickerStyles.label} htmlFor="dms-invite-role">
              Role in DMS
            </label>
            <select
              id="dms-invite-role"
              className={pickerStyles.select}
              disabled={rolesLoading || rolesFailed}
              aria-invalid={errors.role ? true : undefined}
              aria-describedby={errors.role ? "dms-invite-role-error" : undefined}
              {...register("role")}
            >
              <option value="">
                {rolesLoading
                  ? "Loading roles…"
                  : rolesFailed
                    ? "Could not load roles"
                    : "Select a role…"}
              </option>
              {roles?.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
            {errors.role && (
              <p id="dms-invite-role-error" className={pickerStyles.note} role="alert">
                {errors.role.message}
              </p>
            )}
            {/* The chosen role's own summary: the person choosing is usually not
                the person who will do the job. */}
            {chosen && <p className={pickerStyles.hint}>{chosen.summary}</p>}
          </div>
        </div>

        <div className={dialogStyles.actions}>
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Dialog.Close>
          <Button type="submit" isLoading={isPending}>
            {isPending ? "Adding…" : "Add user"}
          </Button>
        </div>
      </form>
    </>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
