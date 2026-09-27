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
 *                   are absent rather than disabled.
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
import { visibleApps } from "../../navigation";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { TextField } from "../../components/TextField";
import { useDealers } from "../hooks/useDealers";
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
  const isDealerAdmin = membership.unit_id !== null;
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

  const [selectedApps, setSelectedApps] = useState<string[]>(user.apps.map((app) => app.app));
  const [unitId, setUnitId] = useState(user.unit_id ?? "");
  const [role, setRole] = useState<"admin" | "member">(editableRole);
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);

  const apps = visibleApps(membership).filter((app) => app.enabled);
  const { data: dealers } = useDealers({ enabled: !isDealerAdmin });
  const { mutateAsync: update, isPending } = useUpdateUser();

  /*
   * A closed dealership is not offered — but if this person is already scoped
   * to one, it stays in the list. Otherwise opening this dialog to fix a
   * spelling would silently move them to "Organisation" on save.
   */
  const dealerOptions =
    dealers?.filter((dealer) => dealer.status === "active" || dealer.id === user.unit_id) ?? [];

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

  function toggleApp(key: string) {
    setSelectedApps((current) =>
      current.includes(key) ? current.filter((app) => app !== key) : [...current, key],
    );
  }

  async function onSubmit(values: EditFields) {
    setFormError(null);

    try {
      await update({
        userId: user.id,
        body: {
          ...values,
          /*
           * A dealer admin sends this person's EXISTING scope, apps and role
           * rather than anything the form collected — they were never shown
           * those fields and must not change them. The backend applies the
           * same rule from their membership; this is the form matching it,
           * not the form deciding it.
           */
          unit_id: isDealerAdmin ? user.unit_id : unitId || null,
          app_keys: isDealerAdmin ? user.apps.map((app) => app.app) : selectedApps,
          role: isDealerAdmin || isOwner ? editableRole : role,
        },
      });
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
        <Dialog.Title className={styles.title}>Edit person</Dialog.Title>
        <Dialog.Description className={styles.description}>
          {isDealerAdmin
            ? `Their name. Access is fixed to ${membership.unit_name ?? "this dealer"} and DMS.`
            : "Their name, what they can open, and which dealer they belong to."}
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

          {!isDealerAdmin && (
            <>
              <fieldset className={styles.section}>
                <legend className={styles.legend}>Apps</legend>
                <div className={styles.choices}>
                  {apps.map((app) => (
                    <label key={app.definition.key} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={selectedApps.includes(app.definition.key)}
                        onChange={() => toggleApp(app.definition.key)}
                      />
                      <span>{app.definition.name}</span>
                    </label>
                  ))}
                </div>
                <p className={styles.hint}>
                  Removing an app takes their access away immediately. Their role inside each
                  app is set separately.
                </p>
              </fieldset>

              <fieldset className={styles.section}>
                <legend className={styles.legend}>Dealer</legend>
                <select
                  className={styles.select}
                  value={unitId}
                  onChange={(event) => setUnitId(event.target.value)}
                  aria-label="Dealer"
                  disabled={!selectedApps.includes("dms")}
                >
                  <option value="">Organisation — every dealer</option>
                  {dealerOptions.map((dealer) => (
                    <option key={dealer.id} value={dealer.id}>
                      {dealer.name}
                    </option>
                  ))}
                </select>
                <p className={styles.hint}>
                  {selectedApps.includes("dms")
                    ? "Only DMS is split by dealer."
                    : "Only DMS is split by dealer. Give them DMS above to scope them to one."}
                </p>
              </fieldset>

              <fieldset className={styles.section} disabled={isOwner}>
                <legend className={styles.legend}>Organisation role</legend>
                <select
                  className={styles.select}
                  value={isOwner ? "owner" : role}
                  onChange={(event) => {
                    setRole(event.target.value as "admin" | "member");
                  }}
                  aria-label="Organisation role"
                >
                  {/*
                    Shown but not selectable for the owner, because leaving the
                    control blank would read as "this person has no role".
                  */}
                  {isOwner && <option value="owner">Owner</option>}
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
                <p className={styles.hint}>
                  {isOwner
                    ? "The owner's role cannot be changed here. Transfer ownership to somebody else first."
                    : "Admins manage the organisation. A dealer admin is an admin with a dealer set above."}
                </p>
              </fieldset>
            </>
          )}
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
