/**
 * Invite someone into the organisation.
 *
 * NOT "create a user". Nobody here sets somebody else's password (C14):
 * an invitation goes out, the person accepts it and chooses their own
 * credentials. That is why the new row appears as "Invitation sent" rather
 * than active, and why there is no password field on this form.
 *
 * SCOPE IS THE INTERESTING FIELD. A person belongs to the organisation; the
 * only app that can narrow that is DMS, because it is the only unit-aware one
 * (C5). So the picker is disabled unless DMS is selected, and says why —
 * rather than silently accepting a dealer that would mean nothing in CRM.
 *
 * ROLES ARE NOT SET HERE. Q11 and Q12 are open, so a role dropdown would be
 * the frontend inventing a vocabulary the backend has not agreed. Access is
 * granted per app now; roles land when those questions are answered.
 */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { asProblem } from "@xpredict/api-client";

import type { Membership } from "../../api/auth";
import { visibleApps } from "../../navigation";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { TextField } from "../../components/TextField";
import { useDealers } from "../hooks/useDealers";
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
  /*
   * A dealer admin has nothing to choose (C23). Everyone they invite joins
   * their dealer with DMS, because that is the only access they can grant —
   * so the apps and dealer fields are not disabled, they are absent. A form
   * that asks a question with one possible answer is a form that wastes a
   * decision.
   */
  const isDealerAdmin = membership.unit_id !== null;

  /* Only the apps this organisation actually has, and can actually open. */
  const apps = visibleApps(membership).filter((app) => app.enabled);

  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string>("");
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);

  const dmsSelected = selectedApps.includes("dms");

  /*
   * Only fetched once DMS is ticked: most invitations are organisation-wide,
   * and a request nobody needed is still a request.
   */
  const { data: dealers, isPending: dealersPending } = useDealers({
    // A dealer admin never opens the picker, and asking for a list of every
    // dealership is a request they would not be entitled to answer anyway.
    enabled: dmsSelected && !isDealerAdmin,
  });

  /*
   * Closed dealerships are not offered. Scoping a new person to one would
   * create somebody who cannot see anything on their first day — and the
   * backend would be right to refuse it.
   */
  const openDealers = dealers?.filter((dealer) => dealer.status === "active");
  const { mutateAsync: invite, isPending } = useInviteUser();

  /*
   * Clearing DMS clears the dealer with it. Leaving a stale unit_id on the
   * form would send a dealer scope for somebody who is not in the only app
   * that has dealers — accepted by a lenient backend, invisible here, and
   * baffling the day it starts mattering.
   */
  useEffect(() => {
    if (!dmsSelected) setUnitId("");
  }, [dmsSelected]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteFields>({
    resolver: zodResolver(inviteSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  function toggleApp(key: string) {
    setSelectedApps((current) =>
      current.includes(key) ? current.filter((app) => app !== key) : [...current, key],
    );
  }

  async function onSubmit(values: InviteFields) {
    setFormError(null);

    try {
      await invite({
        ...values,
        // A dealer admin's own dealer and DMS, decided here rather than asked.
        // The backend applies the same rule from their membership — this is
        // the form matching it, not the form deciding it.
        unit_id: isDealerAdmin ? membership.unit_id : unitId || null,
        app_keys: isDealerAdmin ? ["dms"] : selectedApps,
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
        <Dialog.Title className={styles.title}>Invite user</Dialog.Title>
        <Dialog.Description className={styles.description}>
          They join {isDealerAdmin ? membership.unit_name : membership.org_name} and choose
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

        {isDealerAdmin ? (
          <p className={styles.scopeNote}>
            They join <strong>{membership.unit_name}</strong> with access to DMS. Access to
            anything else in {membership.org_name} is granted by an organisation admin.
          </p>
        ) : (
          <>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Apps</legend>
          <p className={styles.hint}>
            Which apps this person can open. Only apps {membership.org_name} subscribes to
            are listed.
          </p>

          <div className={styles.appChoices}>
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
        </fieldset>

        <fieldset className={styles.fieldset} disabled={!dmsSelected}>
          <legend className={styles.legend}>Dealer</legend>
          <p className={styles.hint}>
            {dmsSelected
              ? "Leave as Organisation for someone who works across every dealer."
              : /*
                 * Says why it is off. A greyed control with no explanation is
                 * read as broken, and the reason here is the actual model
                 * rather than an arbitrary rule.
                 */
                "Only DMS is split by dealer. Select DMS above to scope this person to one."}
          </p>

          <select
            className={styles.select}
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            aria-label="Dealer"
          >
            <option value="">Organisation — every dealer</option>
            {dealersPending && dmsSelected && <option disabled>Loading dealers…</option>}
            {openDealers?.map((dealer) => (
              <option key={dealer.id} value={dealer.id}>
                {dealer.name}
              </option>
            ))}
          </select>
        </fieldset>
          </>
        )}

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
