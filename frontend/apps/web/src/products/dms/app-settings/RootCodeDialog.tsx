/**
 * Edit code, on the ORGANISATION's box in Territory Management (2026-11-26).
 *
 * The box is the organisation -- its name is the organisation's and it never
 * moves -- but it has a code, "HO" from the start, because records filed at
 * the organisation are numbered with it (ENQ/HO/26-27/0001). This changes that
 * code and nothing else. Built on `ConfirmDialog` from packages/ui, so it
 * imports nothing across the shell boundary (Q81).
 */

import { useState } from "react";
import { asProblem } from "@xpredict/api-client";
import { ConfirmDialog } from "@xpredict/ui";

import type { DmsTerritory } from "./territories";
import { useUpdateRootCode } from "./useTerritories";
import styles from "./TerritoryForm.module.css";

const CODE = /^[A-Z0-9][A-Z0-9-]{1,9}$/;

export function RootCodeDialog({
  territory,
  onClose,
}: {
  territory: DmsTerritory;
  onClose: () => void;
}) {
  const [code, setCode] = useState(territory.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const { mutate, isPending } = useUpdateRootCode();

  const save = () => {
    const wanted = code.trim().toUpperCase();
    if (!CODE.test(wanted)) {
      setError("A code is 2 to 10 letters, digits or hyphens, like HO.");
      return;
    }
    mutate(
      { territoryId: territory.id, code: wanted },
      {
        onSuccess: onClose,
        onError: (problem) => {
          const p = asProblem(problem);
          setError(p.code === "territory_code_taken" ? "Another territory already uses that code." : p.detail);
        },
      },
    );
  };

  return (
    <ConfirmDialog
      open
      title="Organisation code"
      confirmLabel={isPending ? "Saving…" : "Save"}
      onConfirm={save}
      onCancel={onClose}
      message={
        <label className={styles.rootCode}>
          <span>
            Records filed at the organisation are numbered with this code:{" "}
            <strong>ENQ/{code.trim().toUpperCase() || "HO"}/26-27/0001</strong>.
          </span>
          <input
            aria-label="Organisation code"
            value={code}
            maxLength={10}
            onChange={(event) => {
              setCode(event.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
          />
          {error && (
            <span role="alert" className={styles.rootCodeError}>
              {error}
            </span>
          )}
        </label>
      }
    />
  );
}
