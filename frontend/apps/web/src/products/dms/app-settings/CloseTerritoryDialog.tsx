/**
 * Close a territory (the owner, 2026-11-24): C63's closing, for any kind.
 * Asks first, in the Delete dialogs' styles, saying exactly what happens --
 * and that Reopen gives it all back, because closing writes nothing else.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import { Button } from "../../../shell/components/Button";
import { FormBanner } from "../../../shell/components/FormBanner";
import styles from "../../../shell/admin/components/RemoveUserDialog.module.css";
import type { DmsTerritory } from "./territories";
import { useSetTerritoryStatus } from "./useTerritories";

interface CloseTerritoryDialogProps {
  territory: DmsTerritory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloseTerritoryDialog({ territory, open, onOpenChange }: CloseTerritoryDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: setStatus, isPending } = useSetTerritoryStatus();

  async function onConfirm() {
    setError(null);
    try {
      await setStatus({ territoryId: territory.id, action: "close" });
      onOpenChange(false);
    } catch (caught) {
      setError(asProblem(caught).detail);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        setError(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <Dialog.Title className={styles.title}>Close {territory.name}?</Dialog.Title>

          <Dialog.Description className={styles.description}>
            People placed only at <strong>{territory.name}</strong> lose access until it is
            reopened. Its records stay, and the territories under it stay open.
          </Dialog.Description>

          <p className={styles.alternative}>
            Nothing else changes, so <strong>Reopen territory</strong> gives everything back.
          </p>

          {error && <FormBanner>{error}</FormBanner>}

          <div className={styles.actions}>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Keep it open
              </Button>
            </Dialog.Close>
            <button
              type="button"
              className={styles.confirm}
              disabled={isPending}
              onClick={() => void onConfirm()}
            >
              {isPending ? "Closing…" : "Close territory"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
