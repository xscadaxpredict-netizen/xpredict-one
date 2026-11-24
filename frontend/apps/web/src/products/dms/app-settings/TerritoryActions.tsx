/**
 * The ⋮ on a territory's panel (the owner, 2026-11-24): Edit, and Close or
 * Reopen.
 *
 *   Edit    -- its own page, the New Territory form filled in (Q78: a page)
 *                                                      (`dms.territory.update`)
 *   Close   -- asks first; its people whose every place is closed lose DMS,
 *              what is under it stays open             (`dms.territory.set_status`)
 *   Reopen  -- no question: it gives back exactly what was there
 *
 * GREYED, NOT HIDDEN: the organisation itself (the root) is changed by
 * nothing here, and anything this person may not do. The server refuses both
 * too; this is the screen agreeing.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { asProblem } from "@xpredict/api-client";

import { useAccess } from "../../../shell/access";
import { useShellContext } from "../../../shell/context";
import { RowMenu } from "../../../shell/admin/components/RowMenu";
import { CloseTerritoryDialog } from "./CloseTerritoryDialog";
import type { DmsTerritory } from "./territories";
import { useSetTerritoryStatus } from "./useTerritories";

interface TerritoryActionsProps {
  territory: DmsTerritory;
  /** Where a refused Reopen is said (null clears it). */
  onStatusError: (message: string | null) => void;
}

export function TerritoryActions({ territory, onStatusError }: TerritoryActionsProps) {
  const { membership } = useShellContext();
  const navigate = useNavigate();
  const [closing, setClosing] = useState(false);
  const { mutate: setStatus, isPending } = useSetTerritoryStatus();
  const access = useAccess();
  const canEdit = access.can("dms.territory.update");
  const canSetStatus = access.can("dms.territory.set_status");

  const isClosed = territory.status === "disabled";
  const isRoot = territory.is_root;

  return (
    <>
      <RowMenu
        label={`More actions for ${territory.name}`}
        items={[
          {
            label: "Edit",
            disabled: !canEdit || isRoot,
            onSelect: () =>
              void navigate(
                `/${membership.org_slug}/dms/settings/territories/${territory.id}/edit`,
              ),
          },
          isClosed
            ? {
                label: "Reopen territory",
                disabled: !canSetStatus || isPending,
                onSelect: () =>
                  setStatus(
                    { territoryId: territory.id, action: "reopen" },
                    {
                      onSuccess: () => onStatusError(null),
                      onError: (error) => onStatusError(asProblem(error).detail),
                    },
                  ),
              }
            : {
                label: "Close territory",
                danger: true,
                disabled: !canSetStatus || isRoot,
                onSelect: () => setClosing(true),
              },
        ]}
        note={
          isRoot
            ? "This is the organisation itself. It shows the organisation's name and is not changed here."
            : !canEdit && !canSetStatus
              ? "Your role lets you see territories, not change them."
              : undefined
        }
      />

      {closing && (
        <CloseTerritoryDialog
          territory={territory}
          open
          onOpenChange={(open) => !open && setClosing(false)}
        />
      )}
    </>
  );
}
