/**
 * Correct somebody's details, or change what they can reach.
 *
 * WHAT IS EDITABLE AND WHAT IS NOT, because the exclusions are the design:
 *
 *   name          — always. It belongs to the person.
 *   email         — ONLY while an invitation is outstanding. Once somebody has
 *                   accepted, their address is how they sign in; changing it
 *                   silently is an account takeover with extra steps, and
 *                   needs its own flow confirming to the new address. But a
 *                   typo on an unaccepted invitation is a dead end — the
 *                   invitation reached nobody and never will — so that case is
 *                   worth fixing here.
 *   dealer, apps  — organisation admins only (C23). A dealer admin grants DMS
 *                   at their own dealer and nothing else, so for them these
 *                   are absent rather than disabled. For an organisation admin
 *                   the two constrain each other: somebody who belongs to one
 *                   dealer cannot hold an organisation-wide product (C27). The
 *                   rule is in `../dealerScope.ts`, shared with the invite form.
 *   role          — member or admin. NOT owner: there is exactly one per
 *                   organisation (C14), so appointing a new one is a transfer,
 *                   and doing it through this form would leave the
 *                   organisation with two owners or none.
 *   status        — not here. Deactivating is its own action with its own
 *                   rule, and a payload that could carry it would make "fix a
 *                   spelling" and "switch this person off" the same request.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import type { Membership } from "../../api/auth";
import type { OrgUser } from "../api/users";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { TextField } from "../../components/TextField";
import { PersonAccessFields, usePersonAccess } from "./PersonAccessFields";
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
  membership: Membership;
}

export function EditUserDialog({ user, membership }: EditUserDialogProps) {
  const [open, setOpen] = useState(false);
  console.log(membership);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.trigger}>
        <PencilIcon />
        Edit
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          {/*
            `key` on the person AND on open: reopening starts from what is
            saved rather than from an abandoned edit, and picking a different
            person while this is mounted reseeds the fields.
          */}
          <EditUserForm
            key={`${user.id}-${String(open)}`}
            user={user}
            membership={membership}
            onDone={() => setOpen(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface EditUserFormProps {
  user: OrgUser;
  membership: Membership;
  onDone: () => void;
}

function EditUserForm({ user, membership, onDone }: EditUserFormProps) {
  /*
   * `membership` is the CALLER's, and this asks whether they belong to one
   * dealership — not whether they are a dealer admin, which is three facts and
   * this is one of them (C40). See `callerIsUnitScoped` in
   * `PersonAccessFields` for the full reasoning; the short version is that the
   * old name, `isDealerAdmin`, was C31's definition and C31 is gone.
   *
   * Only the description line below reads it. Everything that acts on it lives
   * in the shared hook, which derives the same thing from the same membership.
   */
  const callerIsUnitScoped = membership.unit_id !== null;
  const isInvited = user.status === "invited";
  const isOwner = user.role === "owner";

  /*
   * The owner's role mapped into the two this form can express.
   *
   * Narrowed once rather than cast at each use: the backend preserves an
   * owner's role whatever is sent (C14), so this value is only ever a
   * placeholder for somebody whose role the form is not allowed to change.
   */
  const editableRole: "admin" | "member" = user.role === "owner" ? "admin" : user.role;

  /*
   * SCOPE, APPS AND ROLES COME FROM `usePersonAccess` — the same hook the
   * invite dialog uses.
   *
   * This form used to ask the same three questions in its own order with its
   * own controls: apps first, then a dealer DROPDOWN where "Organisation" was
   * one option among dealerships. C30 settled that scope is asked FIRST and
   * with a radio, because the dealership is a fact about the person and their
   * apps follow from it — and C30 itself recorded that this form "keeps the
   * older layout". It does not any more.
   *
   * Seeded from what they hold now, so opening this to fix a spelling and
   * saving changes nothing else (C25).
   */
  const access = usePersonAccess({
    membership,
    initial: {
      unitId: user.unit_id,
      apps: user.apps.map((app) => ({ app: app.app, roleCode: app.role_code })),
      orgRole: editableRole,
    },
  });

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

    const problem = access.problem();
    if (problem) {
      setFormError({ message: problem });
      return;
    }

    try {
      await update({
        userId: user.id,
        /*
         * `access.payload()` already handles the dealer-admin case: it sends
         * their own dealership and DMS rather than anything the form
         * collected, because a dealer admin is never shown those fields and
         * must not change them. The backend applies the same rule from their
         * membership; this is the form matching it, not deciding it.
         */
        body: { ...values, ...access.payload() },
      });
      onDone();
    } catch (error) {
      const asproblem = asProblem(error);
      setFormError({
        message: asproblem.detail,
        traceId: asproblem.status >= 500 ? asproblem.trace_id : undefined,
      });
    }
  }

  return (
    <>
      <div className={styles.header}>
        <Dialog.Title className={styles.title}>Edit person</Dialog.Title>
        <Dialog.Description className={styles.description}>
          {callerIsUnitScoped
            ? `Their name. Access is fixed to ${membership.unit_name ?? "this dealer"} and DMS.`
            : "Their name, where they work, and what they can open."}
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
            // Locked once they have accepted: this is how they sign in.
            readOnly={!isInvited}
            aria-describedby="email-note"
            error={errors.email?.message}
            {...register("email")}
          />

          <p id="email-note" className={styles.hint}>
            {isInvited
              ? "The invitation has not been accepted yet, so this can still be corrected. A new invitation goes to the new address."
              : "Sign-in addresses cannot be changed here. The person changes it themselves, confirming from the new address."}
          </p>

          <PersonAccessFields
            access={access}
            membership={membership}
            /*
             * Their CURRENT dealership stays in the picker even if it has
             * closed. Without this, opening the form for somebody at a closed
             * dealership shows it missing and silently moves them to
             * "Organisation" on save — an edit about a spelling changing their
             * scope. An invitation passes nothing, because putting a NEW
             * person into a closed dealership creates somebody who can see
             * nothing on their first day.
             */
            keepUnitId={user.unit_id}
            /*
             * The owner's standing is not editable here. There is exactly one
             * per organisation (C14), so appointing a new one is a transfer
             * rather than an edit — and that flow does not exist yet (Q23).
             */
            lockOrgRole={isOwner}
            scopeHint={`Where ${user.first_name || "this person"} works, which decides what they can be given.`}
          />
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

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11.2 2.3a1.6 1.6 0 0 1 2.3 2.3l-7.4 7.4-3 .7.7-3z" />
      <path d="M10.2 3.3l2.3 2.3" />
    </svg>
  );
}
