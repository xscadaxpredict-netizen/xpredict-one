/**
 * Edit, on DMS settings -> Users (the owner, 2026-11-24): the Admin panel's
 * Edit -- first name, last name, email -- PLUS their role in DMS.
 *
 * EVERY DMS ROLE IS OFFERED (`users/<id>/roles/`; the owner, 2026-11-24: only
 * app roles -- a role says WHAT, the territory WHERE).
 *
 * TERRITORY (2026-11-24): where a joined person works, as chips; "Add a place"
 * picks from DMS's tree. None is allowed -- they then see no DMS records until
 * assigned. Somebody pending has no place yet (C83): they are placed once they
 * have joined, so the field only says so.
 *
 * A JOINED PERSON'S EMAIL IS HOW THEY SIGN IN and cannot change (C25); a
 * pending person's still can, as in the Admin panel.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import { Button } from "../../../shell/components/Button";
import { FormBanner } from "../../../shell/components/FormBanner";
import { TextField } from "../../../shell/components/TextField";
import styles from "../../../shell/admin/components/EditUserDialog.module.css";
import pickerStyles from "../../../shell/admin/components/RolePicker.module.css";
import type { AppUser } from "./api";
import { KIND_LABEL, namesOf } from "./territories";
import { ancestorsOf, buildTree } from "./territoryTree";
import { useDmsPersonRoles, useUpdateDmsUser } from "./useDmsUsers";
import { useDmsTerritories } from "./useTerritories";
import own from "./TerritoryPeople.module.css";

const editSchema = z.object({
  first_name: z.string().trim().min(1, "Enter a first name."),
  last_name: z.string().trim().min(1, "Enter a last name."),
  email: z.string().trim().min(1, "Enter an email address.").email("Enter a valid email address."),
  role: z.string().min(1, "Choose a role."),
});

type EditFields = z.infer<typeof editSchema>;

interface EditDmsUserDialogProps {
  user: AppUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDmsUserDialog({ user, open, onOpenChange }: EditDmsUserDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          {/* Keyed on the person and on open: reopening starts from what is saved. */}
          <EditForm
            key={`${user.id}-${String(open)}`}
            user={user}
            onDone={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditForm({ user, onDone }: { user: AppUser; onDone: () => void }) {
  const isPending = user.status === "pending";
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);
  const { data: roles, isPending: rolesLoading, isError: rolesFailed } = useDmsPersonRoles(user.id);
  const { mutateAsync: update, isPending: saving } = useUpdateDmsUser();
  const { data: territories } = useDmsTerritories();
  const [places, setPlaces] = useState(user.places);
  const tree = buildTree(territories ?? []);
  const addable = [...tree.byId.values()].filter(
    (node) => !places.some((place) => place.id === node.territory.id),
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EditFields>({
    resolver: zodResolver(editSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role?.code ?? "",
    },
  });

  const chosen = roles?.find((role) => role.code === watch("role"));

  async function onSubmit(values: EditFields) {
    setFormError(null);
    try {
      await update({
        userId: user.id,
        // Where they work goes with the save -- for somebody who has joined.
        body: isPending ? values : { ...values, territories: places.map((place) => place.id) },
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
        <Dialog.Title className={styles.title}>Edit user</Dialog.Title>
        <Dialog.Description className={styles.description}>
          Their basic information, their role in DMS and where they work.
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
            readOnly={!isPending}
            aria-describedby="dms-email-note"
            error={errors.email?.message}
            {...register("email")}
          />
          <p id="dms-email-note" className={styles.hint}>
            {isPending
              ? "They have not joined yet, so this can still be corrected."
              : "This is how they sign in, so it cannot be changed here."}
          </p>

          <div className={pickerStyles.field}>
            <label className={pickerStyles.label} htmlFor="dms-edit-role">
              Role in DMS
            </label>
            {/*
              THE FORM'S SELECT EXISTS ONLY ONCE THE ROLES DO. Swapping its
              options under it (current role first, then the full list) made the
              browser fall back to the FIRST option while the form still held the
              saved one -- the screen showed one role and Save would have sent
              another. Mounted with its options, it starts on the saved role.
            */}
            {roles ? (
              <select
                id="dms-edit-role"
                className={pickerStyles.select}
                aria-invalid={errors.role ? true : undefined}
                aria-describedby={errors.role ? "dms-edit-role-error" : undefined}
                {...register("role")}
              >
                {!roles.some((role) => role.code === user.role?.code) && (
                  <option value="">Select a role…</option>
                )}
                {roles.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name}
                  </option>
                ))}
              </select>
            ) : (
              <select id="dms-edit-role" className={pickerStyles.select} disabled>
                <option>{rolesFailed ? "Could not load roles" : "Loading roles…"}</option>
              </select>
            )}
            {errors.role && (
              <p id="dms-edit-role-error" className={pickerStyles.note} role="alert">
                {errors.role.message}
              </p>
            )}
            {chosen && <p className={pickerStyles.hint}>{chosen.summary}</p>}
          </div>

          <div className={pickerStyles.field}>
            <span className={pickerStyles.label} id="dms-edit-territory">
              Territory
            </span>
            {isPending ? (
              <p className={pickerStyles.hint}>
                They are placed in a territory once they have joined.
              </p>
            ) : (
              <>
                <ul className={own.chips} aria-labelledby="dms-edit-territory">
                  {places.map((place) => (
                    <li key={place.id} className={own.chip}>
                      {place.name}
                      <button
                        type="button"
                        aria-label={`Remove ${place.name}`}
                        onClick={() =>
                          setPlaces((current) => current.filter((p) => p.id !== place.id))
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                  {places.length === 0 && <li className={own.none}>No territory yet</li>}
                </ul>
                <label className={pickerStyles.label} htmlFor="dms-edit-add-place">
                  <span className={own.visuallyHidden}>Add a place</span>
                </label>
                <select
                  id="dms-edit-add-place"
                  className={pickerStyles.select}
                  value=""
                  disabled={!territories}
                  onChange={(event) => {
                    const node = tree.byId.get(event.target.value);
                    if (node) {
                      setPlaces((current) => [
                        ...current,
                        { id: node.territory.id, name: node.territory.name },
                      ]);
                    }
                  }}
                >
                  <option value="">{territories ? "+ Add a place…" : "Loading territories…"}</option>
                  {addable.map((node) => (
                    <option
                      key={node.territory.id}
                      value={node.territory.id}
                      // A territory's people hold DMS only (2026-11-24).
                      disabled={user.other_apps.length > 0 && !node.territory.is_root}
                    >
                      {`${"— ".repeat(ancestorsOf(node).length)}${node.territory.name} (${
                        KIND_LABEL[node.territory.kind]
                      })`}
                    </option>
                  ))}
                </select>
                <p className={pickerStyles.hint}>
                  {user.other_apps.length > 0
                    ? `They also hold ${namesOf(user.other_apps)}, so they can be placed only at the organisation. People at a territory hold DMS only — remove the other apps in the Admin panel first.`
                    : "Where they work in DMS: they see the records there and below. With none, they see no records."}
                </p>
              </>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Dialog.Close>
          {/* `disabled` replaces the button's own busy rule, so saving is named too. */}
          <Button type="submit" isLoading={saving} disabled={rolesLoading || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </>
  );
}
