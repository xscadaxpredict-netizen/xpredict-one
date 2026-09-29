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
import { visibleApps } from "../../navigation";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { TextField } from "../../components/TextField";
import { RolePicker } from "./RolePicker";
import { dealerScopeRules } from "../dealerScope";
import { rolesFor } from "../api/roles";
import { useDealers } from "../hooks/useDealers";
import { useRoles } from "../hooks/useRoles";
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
  /**
   * Seeded from what they hold NOW, so opening this to fix a spelling and
   * saving leaves their roles exactly as they were.
   *
   * Keyed by role CODE, but `user.apps` carries display NAMES — the server
   * resolves one from the other, the way it resolves `unit_name`. Matching by
   * name is why this is seeded here rather than read from `user` at submit.
   */
  const [appRoles, setAppRoles] = useState<Record<string, string>>({});
  const [role, setRole] = useState<"admin" | "member">(editableRole);
  const [formError, setFormError] = useState<{ message: string; traceId?: string } | null>(null);

  /*
   * PRODUCTS only. Administration is excluded because it is granted by the
   * Organisation role below, not by a tick — it comes with the platform and is
   * gated by role alone (C17, C31). Two controls for one thing could disagree,
   * and the way it disagreed was silent: admin access with member standing.
   */
  const apps = visibleApps(membership).filter(
    (app) => app.enabled && app.definition.key !== "admin",
  );
  const scope = dealerScopeRules(selectedApps, unitId);
  const { data: roles } = useRoles();
  const { data: dealers } = useDealers({ enabled: !isDealerAdmin });

  const scopedToDealer = unitId !== "";

  function optionsFor(appKey: string) {
    return rolesFor(roles ?? [], appKey, scopedToDealer);
  }

  /**
   * What they hold in this app: an explicit choice, else the role they already
   * have, else the default for the scope.
   *
   * THE MIDDLE CASE IS THE IMPORTANT ONE. Moving somebody between dealerships,
   * or granting them CRM, must not quietly reassign their DMS role — C25's
   * rule, which survives roles becoming assignable. The match is by display
   * name because that is what a stored user carries.
   */
  function roleFor(appKey: string) {
    const chosen = appRoles[appKey];
    if (chosen) return chosen;

    const held = user.apps.find((app) => app.app === appKey);
    const options = optionsFor(appKey);
    const matching = options.find((role) => role.name === held?.role);
    if (matching) return matching.code;

    /*
     * Nothing held, so this app is being granted right now. One option is
     * preselected because there is no decision to make; several stay empty and
     * the save is refused, rather than quietly assigning whatever heads the
     * list — which is the most capable role, since that is the order.
     *
     * The `matching` case above is why an edit about a spelling never lands
     * here: a role already held is found and returned first (C25).
     */
    return options.length === 1 ? (options[0]?.code ?? "") : "";
  }

  /** Whether the role chosen for an app carries administration of the scope. */
  function roleAdministers(appKey: string) {
    return optionsFor(appKey).find((role) => role.code === roleFor(appKey))?.administers ?? false;
  }
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

    const unanswered = (isDealerAdmin ? [] : selectedApps)
      .filter((app) => app !== "admin")
      .filter((app) => !roleFor(app));

    if (unanswered.length > 0) {
      setFormError({
        message: roles
          ? `Choose a role for ${unanswered.map((app) => app.toUpperCase()).join(" and ")}.`
          : "Roles are still loading. Try again in a moment.",
      });
      return;
    }

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
          apps: (isDealerAdmin ? user.apps.map((app) => app.app) : selectedApps)
            .filter((app) => app !== "admin")
            .map((app) => ({ app, role: roleFor(app) })),
          /*
           * A DEALERSHIP USER'S STANDING COMES FROM THEIR DMS ROLE (C34), not
           * from the Organisation role select — which is hidden for them,
           * because "admin at this dealer" and "admin of the organisation" are
           * the same field and only one of them is theirs to be.
           *
           * Somebody organisation-wide still answers it directly: an admin
           * there spans every app, so no single app's role could carry it.
           */
          role: isDealerAdmin || isOwner
            ? editableRole
            : scopedToDealer
              ? roleAdministers("dms")
                ? ("admin" as const)
                : ("member" as const)
              : role,
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
                        // They belong to a dealer and this app is
                        // organisation-wide (C27). Never locks an app they
                        // ALREADY hold — see `dealerScopeRules`: a record that
                        // predates this rule has to be fixable, and the only
                        // edit that fixes it is removing the app.
                        disabled={scope.isAppLocked(app.definition.key)}
                        onChange={() => toggleApp(app.definition.key)}
                      />
                      <span>{app.definition.name}</span>
                    </label>
                  ))}
                </div>
                <p className={styles.hint}>
                  {scope.appsNote ?? "Removing an app takes their access away immediately."}
                </p>

                {/* One per app they hold, so a role can be changed here too. */}
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
                        setAppRoles((current) => ({ ...current, [app.definition.key]: code }));
                      }}
                    />
                  ))}
              </fieldset>

              <fieldset className={styles.section}>
                <legend className={styles.legend}>Dealer</legend>
                <select
                  className={styles.select}
                  value={unitId}
                  onChange={(event) => setUnitId(event.target.value)}
                  aria-label="Dealer"
                  disabled={!scope.canPickDealer}
                >
                  <option value="">Organisation — every dealer</option>
                  {dealerOptions.map((dealer) => (
                    <option key={dealer.id} value={dealer.id}>
                      {dealer.name}
                    </option>
                  ))}
                </select>
                <p className={styles.hint}>{scope.dealerNote}</p>
              </fieldset>

              {/*
                HIDDEN FOR A DEALERSHIP USER (C34). "Admin at this dealer" and
                "admin of the organisation" are the same field, and for somebody
                scoped to a dealership only the first is available — so it is
                carried by their DMS role instead. Leaving this here would be
                two controls writing one value and free to disagree, which is
                what the separate dealer-admin tick already was.
              */}
              <fieldset
                className={styles.section}
                disabled={isOwner}
                hidden={scopedToDealer}
              >
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
                    : unitId
                      ? "An admin with a dealership set above is a dealer admin: they manage that dealership's people and nothing else."
                      : "Admins manage dealerships, people and billing. This is also what grants Administration — there is no separate tick for it."}
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
