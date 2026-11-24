/**
 * The People tab's row actions (the owner, 2026-11-24):
 *
 *   Move   -- this place swapped for another; their role and other places stay.
 *   Remove -- this place comes off. Their LAST place may go: they then see no
 *             DMS records until somebody assigns them a territory again, which
 *             the dialog says before it happens.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import { Button } from "../../../shell/components/Button";
import { FormBanner } from "../../../shell/components/FormBanner";
import confirm from "../../../shell/admin/components/RemoveUserDialog.module.css";
import pickerStyles from "../../../shell/admin/components/RolePicker.module.css";
import { namesOf, type DmsTerritory, type TerritoryPerson } from "./territories";
import { territoryLabel, type Tree } from "./territoryTree";
import { useMovePerson, useRemovePerson } from "./useTerritories";

export function personName(person: Pick<TerritoryPerson, "first_name" | "last_name" | "email">) {
  return `${person.first_name} ${person.last_name}`.trim() || person.email;
}

interface DialogProps {
  territory: DmsTerritory;
  person: TerritoryPerson;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemovePersonDialog({ territory, person, open, onOpenChange }: DialogProps) {
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: remove, isPending } = useRemovePerson();
  const name = personName(person);
  const isLast = person.other_places.length === 0;

  async function onConfirm() {
    setError(null);
    try {
      await remove({ territoryId: territory.id, personId: person.id });
      onOpenChange(false);
    } catch (failure) {
      setError(asProblem(failure).detail);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={confirm.overlay} />
        <Dialog.Content className={confirm.dialog}>
          <Dialog.Title className={confirm.title}>
            Remove {name} from {territory.name}?
          </Dialog.Title>
          <Dialog.Description className={confirm.description}>
            {isLast ? (
              <>
                This is the only territory <strong>{name}</strong> works at. They keep DMS and
                their role, but see no DMS records until they are assigned a territory again.
              </>
            ) : (
              <>
                <strong>{name}</strong> stops working at {territory.name} and keeps{" "}
                {person.other_places.join(", ")}.
              </>
            )}
          </Dialog.Description>
          {isLast && (
            <p className={confirm.alternative}>
              To put them somewhere else instead, use <strong>Move</strong>.
            </p>
          )}

          {error && <FormBanner>{error}</FormBanner>}

          <div className={confirm.actions}>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Keep them here
              </Button>
            </Dialog.Close>
            <button
              type="button"
              className={confirm.confirm}
              disabled={isPending}
              onClick={() => void onConfirm()}
            >
              {isPending ? "Removing…" : "Remove"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function MovePersonDialog({
  territory,
  person,
  tree,
  open,
  onOpenChange,
}: DialogProps & { tree: Tree }) {
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const { mutateAsync: move, isPending } = useMovePerson();
  const name = personName(person);
  const heldElsewhere = person.other_apps.length > 0;

  // Anywhere in the tree but here, in tree order, indented by depth.
  const options = [...tree.byId.values()].filter((node) => node.territory.id !== territory.id);

  async function onMove() {
    setError(null);
    try {
      await move({ territoryId: territory.id, personId: person.id, to });
      onOpenChange(false);
    } catch (failure) {
      setError(asProblem(failure).detail);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={confirm.overlay} />
        <Dialog.Content className={confirm.dialog}>
          <Dialog.Title className={confirm.title}>Move {name}</Dialog.Title>
          <Dialog.Description className={confirm.description}>
            From <strong>{territory.name}</strong> to another territory. Their role
            {person.other_places.length > 0 ? " and their other places stay." : " stays."}
          </Dialog.Description>

          <div className={pickerStyles.field}>
            <label className={pickerStyles.label} htmlFor="move-to">
              Move to
            </label>
            <select
              id="move-to"
              className={pickerStyles.select}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            >
              <option value="">Choose a territory…</option>
              {options.map((node) => (
                <option
                  key={node.territory.id}
                  value={node.territory.id}
                  // A territory's people hold DMS only (2026-11-24).
                  disabled={heldElsewhere && !node.territory.is_root}
                >
                  {territoryLabel(node)}
                </option>
              ))}
            </select>
            {heldElsewhere && (
              <p className={pickerStyles.hint}>
                {name} also holds {namesOf(person.other_apps)}, so they can be placed only at the
                organisation. People at a territory hold DMS only — remove the other apps in the
                Admin panel first.
              </p>
            )}
          </div>

          {error && <FormBanner>{error}</FormBanner>}

          <div className={confirm.actions}>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              isLoading={isPending}
              disabled={!to || isPending}
              onClick={() => void onMove()}
            >
              {isPending ? "Moving…" : "Move"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
