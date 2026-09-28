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
   * A dealer admin has nothing to choose (C23). Everyone they invite joins
   * their dealer with DMS, because that is the only access they can grant —
   * so the apps and dealer fields are not disabled, they are absent. A form
   * that asks a question with one possible answer is a form that wastes a
   * decision.
   */
  const isDealerAdmin = membership.unit_id !== null;

  /* Only the apps this organisation actually has, and can actually open. */
  const apps = visibleApps(membership).filter((app) => app.enabled);

  /**
   * WHERE THEY WORK, asked before what they can open.
   *
   * This is the first question because it is the one that decides the others:
   * the unit is an organisational fact about a person (C7) and their apps
   * follow from it (C27), not the other way round. Asking apps first meant
   * ticking DMS purely to unlock a dealer picker — a hoop, and it made
   * "belongs to a dealership" look like a property of DMS rather than of them.
   */
  const [scope, setScope] = useState<"org" | "dealer">(initialUnitId ? "dealer" : "org");
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [unitId, setUnitId] = useState<string>(initialUnitId ?? "");
  /** Grants Administration, narrowed to Users at their own dealer (C23). */
  const [managesPeople, setManagesPeople] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);

  const scopedToDealer = scope === "dealer";

  /*
   * Only fetched once a dealership is actually being chosen: most invitations
   * are organisation-wide, and a request nobody needed is still a request.
   */
  const { data: dealers, isPending: dealersPending } = useDealers({
    // A dealer admin never opens the picker, and asking for a list of every
    // dealership is a request they would not be entitled to answer anyway.
    enabled: scopedToDealer && !isDealerAdmin,
  });

  /*
   * Closed dealerships are not offered. Scoping a new person to one would
   * create somebody who cannot see anything on their first day — and the
   * backend would be right to refuse it.
   */
  const openDealers = dealers?.filter((dealer) => dealer.status === "active");
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

  function toggleApp(key: string) {
    setSelectedApps((current) =>
      current.includes(key) ? current.filter((app) => app !== key) : [...current, key],
    );
  }

  /**
   * The payload is derived from `scope`, never assembled from whatever the
   * fields happen to hold.
   *
   * That is what makes C27 structural here rather than policed: a
   * dealer-scoped invitation cannot carry CRM because nothing reads
   * `selectedApps` on that branch, and an organisation-wide one cannot carry a
   * dealership because nothing reads `unitId`. Switching back and forth leaves
   * the other branch's answers intact for the person's convenience, and they
   * are simply never sent.
   */
  function accessForScope() {
    if (isDealerAdmin) {
      // Their own dealer and DMS, decided here rather than asked (C23). The
      // backend applies the same rule from their membership — this is the form
      // matching it, not the form deciding it.
      return { unit_id: membership.unit_id, app_keys: ["dms"] };
    }

    if (scopedToDealer) {
      return {
        unit_id: unitId,
        app_keys: managesPeople ? ["dms", "admin"] : ["dms"],
      };
    }

    return { unit_id: null, app_keys: selectedApps };
  }

  async function onSubmit(values: InviteFields) {
    setFormError(null);
    setScopeError(null);

    /*
     * There is no "no dealership" option in the picker any more — choosing the
     * organisation is a different radio — so an empty one means they picked
     * the branch and then did not answer it.
     */
    if (!isDealerAdmin && scopedToDealer && !unitId) {
      setScopeError("Choose which dealership they work for.");
      return;
    }

    try {
      await invite({
        ...values,
        ...accessForScope(),
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
              <legend className={styles.legend}>Where they work</legend>

              <label className={styles.checkbox}>
                <input
                  type="radio"
                  name="scope"
                  checked={!scopedToDealer}
                  onChange={() => setScope("org")}
                />
                <span>The whole organisation</span>
              </label>

              <label className={styles.checkbox}>
                <input
                  type="radio"
                  name="scope"
                  checked={scopedToDealer}
                  onChange={() => setScope("dealer")}
                />
                <span>One dealership</span>
              </label>

              {scopedToDealer && (
                <>
                  <select
                    className={styles.select}
                    value={unitId}
                    onChange={(event) => setUnitId(event.target.value)}
                    aria-label="Dealership"
                  >
                    <option value="">Select a dealership…</option>
                    {dealersPending && <option disabled>Loading dealerships…</option>}
                    {openDealers?.map((dealer) => (
                      <option key={dealer.id} value={dealer.id}>
                        {dealer.name}
                      </option>
                    ))}
                  </select>

                  {scopeError && <p className={styles.error}>{scopeError}</p>}
                </>
              )}
            </fieldset>

            {/*
              WHAT THEY CAN OPEN, and the two branches are deliberately
              different shapes rather than one list with things greyed out.

              Somebody who belongs to a dealership can hold DMS and
              Administration and nothing else (C27), so there is no choice of
              app left to offer — only whether they administer the place. A
              checkbox list where two of three are permanently disabled would
              be asking a question that has one answer.
            */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>What they can open</legend>

              {scopedToDealer ? (
                <>
                  <p className={styles.hint}>
                    <strong>DMS</strong>, at this dealership only. CRM and E-commerce are
                    organisation-wide and cannot be given to somebody scoped to a
                    dealership.
                  </p>

                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={managesPeople}
                      onChange={(event) => setManagesPeople(event.target.checked)}
                    />
                    <span>Manage this dealership&rsquo;s people</span>
                  </label>

                  {/*
                    THIS IS WHAT A "DEALER ADMIN" IS (C23), said in words rather
                    than left to be deduced from ticking "Administration" and a
                    dealership together. The grant is the same Administration
                    app an organisation admin holds, narrowed to one module at
                    one dealership — which is a different power under the same
                    name, and the old label said none of it.
                  */}
                  <p className={styles.hint}>
                    They can invite and remove people at this dealership, and nothing
                    else in {membership.org_name}. This is what makes somebody a dealer
                    admin.
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.hint}>
                    Which apps this person can open. Only apps {membership.org_name}{" "}
                    subscribes to are listed.
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
                </>
              )}
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
