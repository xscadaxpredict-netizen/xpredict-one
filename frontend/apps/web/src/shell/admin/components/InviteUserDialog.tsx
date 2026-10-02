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
import { RolePicker } from "./RolePicker";
import { rolesFor } from "../api/roles";
import { useDealers } from "../hooks/useDealers";
import { useRoles } from "../hooks/useRoles";
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

  /*
   * Only the PRODUCTS this organisation has and can open.
   *
   * Administration is excluded deliberately: it is not something a customer
   * subscribes to, it comes with the platform and is gated by role alone
   * (C17). It used to be a checkbox here, which meant two controls governed
   * one thing and could disagree — tick the box, leave the role at member, and
   * you got a record with admin access and no admin standing.
   */
  const apps = visibleApps(membership).filter(
    (app) => app.enabled && app.definition.key !== "admin",
  );

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
  /**
   * The role chosen in each app, keyed by app.
   *
   * Kept per app rather than as one value because a person can hold several,
   * and DMS being Sales executive says nothing about what they are in CRM.
   * Untouched entries for apps they do not have are simply never read — the
   * payload is built from `selectedApps`.
   */
  const [appRoles, setAppRoles] = useState<Record<string, string>>({});
  const [unitId, setUnitId] = useState<string>(initialUnitId ?? "");
  /** Standing in the organisation, for somebody not scoped to a dealership. */
  const [orgRole, setOrgRole] = useState<"admin" | "member">("member");
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);

  const scopedToDealer = scope === "dealer";

  /**
   * Whether the person BEING INVITED belongs to a dealership — which is not
   * the same question as which radio is selected.
   *
   * A dealer admin never sees the radio: everybody they invite joins their own
   * dealership (C23). Reading `scopedToDealer` for them offered the ORG-level
   * roles — so the one question they get, what this person actually does, came
   * back "Fleet viewer", a read-only role across every dealership, for somebody
   * who can only ever see one.
   */
  const inviteeIsUnitScoped = isDealerAdmin || scopedToDealer;

  /* Reference data (C28), so it is asked for once the dialog is open. */
  const { data: roles } = useRoles();

  /**
   * The roles that can be given for one app at the scope now chosen, and the
   * one that applies if nothing is picked.
   *
   * THE FIRST IS THE DEFAULT, and the server decides the order. A grant with
   * no role would be access to an app with no permissions inside it — a person
   * who can open DMS and do nothing, which reads as a bug rather than a
   * decision. The list is ordered most-capable first, so the default is also
   * the one a dealership is most likely to want; anything narrower is a
   * deliberate choice.
   */
  function optionsFor(appKey: string) {
    return rolesFor(roles ?? [], appKey, inviteeIsUnitScoped);
  }

  /**
   * The role chosen for an app, or "" while the question is still open.
   *
   * ONE OPTION IS PRESELECTED; SEVERAL ARE NOT. Where a single role is
   * possible there is no decision to make, so asking somebody to confirm it
   * would be the wasted question C23 warns about. Where several are, this
   * stays empty and the form refuses to submit — the list is ordered
   * most-capable first, so silently defaulting would hand the most powerful
   * role to anybody who did not look. Fail closed.
   */
  function roleFor(appKey: string) {
    const chosen = appRoles[appKey];
    if (chosen) return chosen;

    const options = optionsFor(appKey);

    return options.length === 1 ? (options[0]?.code ?? "") : "";
  }

  /*
   * `roleAdministers` USED TO LIVE HERE and was deleted with C40. It answered
   * "does the chosen DMS role make this person an administrator", and the only
   * thing that ever asked was the line that wrote `admin` into standing.
   *
   * Standing and app roles are independent axes now, so nothing in this form
   * needs the answer. `administers` is still on the role for the Roles page's
   * badge; it simply does not decide anything here.
   */

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
      return {
        unit_id: membership.unit_id,
        apps: [{ app: "dms", role: roleFor("dms") }],
        /*
         * ALWAYS `member`, even when appointing another dealer admin. The
         * DMS role carries that now (C40), and standing stays out of it: a
         * dealership person with `admin` standing is refused by the database,
         * because an administrator of the ORGANISATION is never scoped to one
         * dealership.
         */
        role: "member" as const,
      };
    }

    if (scopedToDealer) {
      /*
       * C31 SAID `admin` + a dealership WAS a dealer admin. C40 superseded it:
       * the DMS role carries the power by itself and standing stays `member`.
       * The two columns are independent axes and neither derives the other.
       * Administration is still never sent as an app; the server derives that
       * from the standing, as it always did.
       */
      return {
        unit_id: unitId,
        apps: [{ app: "dms", role: roleFor("dms") }],
        role: "member" as const,
      };
    }

    return {
      unit_id: null,
      apps: selectedApps.map((app) => ({ app, role: roleFor(app) })),
      role: orgRole,
    };
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
      setScopeError("Select the dealer this user belongs to.");
      return;
    }

    /*
     * A grant with no role is access to an app with no permissions inside it.
     * Two ways to get here — the role list has not arrived, or an app with
     * several roles was left unanswered — so the message names the app rather
     * than guessing which.
     */
    const unanswered = accessForScope().apps.filter((grant) => !grant.role);

    if (unanswered.length > 0) {
      setFormError({
        message: roles
          ? `Choose a role for ${unanswered.map((grant) => grant.app.toUpperCase()).join(" and ")}.`
          : "Roles are still loading. Try again in a moment.",
      });
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
          <>
            <p className={styles.scopeNote}>
              They join <strong>{membership.unit_name}</strong> with access to DMS. Access
              to anything else in {membership.org_name} is granted by an organisation
              admin.
            </p>

            {/*
              The one question a dealer admin still gets. Which dealership and
              which app are both decided for them (C23), but a salesperson and
              a service advisor are not the same job, and only the person doing
              the hiring knows which this is.
            */}
            <RolePicker
              appName="DMS"
              appKey="dms"
              options={optionsFor("dms")}
              value={roleFor("dms")}
              onChange={(code) => {
                setAppRoles((current) => ({ ...current, dms: code }));
              }}
            />
          </>
        ) : (
          <>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Scope</legend>
              <p className={styles.hint}>
                Whether this user works across {membership.org_name} or for a single
                dealer.
              </p>

              <label className={styles.checkbox}>
                <input
                  type="radio"
                  name="scope"
                  checked={!scopedToDealer}
                  onChange={() => setScope("org")}
                />
                <span>Organisation</span>
              </label>

              <label className={styles.checkbox}>
                <input
                  type="radio"
                  name="scope"
                  checked={scopedToDealer}
                  onChange={() => setScope("dealer")}
                />
                <span>Dealership</span>
              </label>

              {scopedToDealer && (
                <>
                  {/*
                    A real <label>, not an aria-label. It is a question the
                    person has to answer, so it should be legible on screen and
                    not only to a screen reader.
                  */}
                  <label className={styles.label} htmlFor="invite-dealer">
                    Select dealer
                  </label>
                  <select
                    id="invite-dealer"
                    className={styles.select}
                    value={unitId}
                    onChange={(event) => setUnitId(event.target.value)}
                  >
                    <option value="">Choose a dealer…</option>
                    {dealersPending && <option disabled>Loading dealers…</option>}
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
              APP ACCESS, and the two branches are deliberately different shapes
              rather than one list with things greyed out.

              Somebody who belongs to a dealership can hold DMS and
              Administration and nothing else (C27), so there is no choice of
              app left to offer — only whether they administer the place. A
              checkbox list where two of three are permanently disabled would
              be asking a question that has one answer.
            */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>App access</legend>

              {scopedToDealer ? (
                <>
                  <p className={styles.hint}>
                    <strong>DMS</strong>, limited to this dealer. CRM and E-commerce are
                    organisation-wide and cannot be granted to a dealership user.
                  </p>

                  <RolePicker
                    appName="DMS"
                    appKey="dms"
                    options={optionsFor("dms")}
                    value={roleFor("dms")}
                    onChange={(code) => {
                      setAppRoles((current) => ({ ...current, dms: code }));
                    }}
                  />
                </>
              ) : (
                <>
                  <p className={styles.hint}>
                    The apps this user can open. Only apps {membership.org_name} subscribes
                    to are listed.
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

                  {/*
                    One per app they were actually given. Ordered as the app
                    list is, so ticking DMS makes its role appear directly
                    under the tick rather than somewhere further down.
                  */}
                  {apps
                    .filter((app) => selectedApps.includes(app.definition.key))
                    .map((app) => (
                      <RolePicker
                        key={app.definition.key}
                        appName={app.definition.name}
                        appKey={app.definition.key}
                        options={optionsFor(app.definition.key)}
                        value={roleFor(app.definition.key)}
                        onChange={(code) => {
                          setAppRoles((current) => ({
                            ...current,
                            [app.definition.key]: code,
                          }));
                        }}
                      />
                    ))}

                  {/*
                    ADMINISTRATION IS NOT IN THE LIST ABOVE. It is granted by
                    this, because it comes with the platform and is gated by
                    role alone (C17) — and because an invitation that could set
                    the access and the standing separately would let somebody
                    hold the admin console while the Users list called them a
                    member.

                    Owner is never offered: exactly one per organisation (C14),
                    so appointing one is a transfer, not an invitation.
                  */}
                  <label className={styles.label} htmlFor="invite-role">
                    Organisation role
                  </label>
                  <select
                    id="invite-role"
                    className={styles.select}
                    value={orgRole}
                    onChange={(event) => {
                      setOrgRole(event.target.value as "admin" | "member");
                    }}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin — can manage the organisation</option>
                  </select>

                  <p className={styles.hint}>
                    Admins manage dealerships, people and billing for{" "}
                    {membership.org_name}. Members only use the apps above.
                  </p>
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
