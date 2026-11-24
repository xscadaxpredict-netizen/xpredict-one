/**
 * Delete territory (the owner, 2026-11-24): "before deleting a territory the
 * records in that territory must be transferred to a different territory".
 *
 * Pick where its records and people go (**Transfer to** -- any other
 * territory, the organisation included), read what will happen, confirm. The
 * counts come from the server (`delete-preview/`), so the sentence says the
 * real numbers. It cannot be undone, and says so -- with Close as the way to
 * stop using a territory without deleting it.
 *
 * Only reached for a territory with nothing under it: the ⋮ greys Delete
 * otherwise (the server refuses it too).
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import { Button } from "../../../shell/components/Button";
import { FormBanner } from "../../../shell/components/FormBanner";
import confirm from "../../../shell/admin/components/RemoveUserDialog.module.css";
import pickerStyles from "../../../shell/admin/components/RolePicker.module.css";
import type { DmsTerritory } from "./territories";
import { territoryLabel, type Tree } from "./territoryTree";
import { useDeletePreview, useDeleteTerritory } from "./useTerritories";

interface DeleteTerritoryDialogProps {
  territory: DmsTerritory;
  tree: Tree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After it is gone: back to the tree. */
  onDeleted: () => void;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${String(count)} ${many}`;
}

export function DeleteTerritoryDialog({
  territory,
  tree,
  open,
  onOpenChange,
  onDeleted,
}: DeleteTerritoryDialogProps) {
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: preview, isError: previewFailed } = useDeletePreview(territory.id);
  const { mutateAsync: remove, isPending } = useDeleteTerritory();

  // Anywhere else in the tree, in tree order.
  const options = [...tree.byId.values()].filter((node) => node.territory.id !== territory.id);
  const target = to ? tree.byId.get(to) : undefined;

  async function onConfirm() {
    setError(null);
    try {
      await remove({ territoryId: territory.id, transferTo: to });
      onOpenChange(false);
      onDeleted();
    } catch (failure) {
      setError(asProblem(failure).detail);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={confirm.overlay} />
        <Dialog.Content className={confirm.dialog}>
          <Dialog.Title className={confirm.title}>Delete {territory.name}?</Dialog.Title>
          <Dialog.Description className={confirm.description}>
            {preview
              ? `${plural(preview.records, "DMS record", "DMS records")} and ${plural(
                  preview.people,
                  "person",
                  "people",
                )} work at ${territory.name}. They move to the territory you choose, then ${
                  territory.name
                } is deleted.`
              : previewFailed
                ? `Its DMS records and people move to the territory you choose, then ${territory.name} is deleted.`
                : "Counting its records and people…"}
          </Dialog.Description>

          <div className={pickerStyles.field}>
            <label className={pickerStyles.label} htmlFor="delete-transfer-to">
              Transfer to
            </label>
            <select
              id="delete-transfer-to"
              className={pickerStyles.select}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            >
              <option value="">Choose a territory…</option>
              {options.map((node) => (
                <option key={node.territory.id} value={node.territory.id}>
                  {territoryLabel(node)}
                </option>
              ))}
            </select>
          </div>

          {target && (
            <p className={confirm.alternative}>
              Records and people move from <strong>{territory.name}</strong> to{" "}
              <strong>{target.territory.name}</strong>. Who sees them follows the tree.{" "}
              <strong>This cannot be undone.</strong> To stop using it without deleting, use{" "}
              <strong>Close</strong> instead.
            </p>
          )}

          {error && <FormBanner>{error}</FormBanner>}

          <div className={confirm.actions}>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Keep it
              </Button>
            </Dialog.Close>
            <button
              type="button"
              className={confirm.confirm}
              disabled={!to || isPending}
              onClick={() => void onConfirm()}
            >
              {isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
