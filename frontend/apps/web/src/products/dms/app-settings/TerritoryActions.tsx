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
import { DeleteTerritoryDialog } from "./DeleteTerritoryDialog";
import type { Tree, TreeNode } from "./territoryTree";
import { useSetTerritoryStatus } from "./useTerritories";

interface TerritoryActionsProps {
  node: TreeNode;
  /** The whole tree, for Delete's Transfer to. */
  tree: Tree;
  /** Where a refused Reopen is said (null clears it). */
  onStatusError: (message: string | null) => void;
}

export function TerritoryActions({ node, tree, onStatusError }: TerritoryActionsProps) {
  const { territory } = node;
  const { membership } = useShellContext();
  const navigate = useNavigate();
  const [opened, setOpened] = useState<"close" | "delete" | null>(null);
  const { mutate: setStatus, isPending } = useSetTerritoryStatus();
  const access = useAccess();
  const canEdit = access.can("dms.territory.update");
  const canSetStatus = access.can("dms.territory.set_status");
  const canDelete = access.can("dms.territory.delete");
  const hasChildren = node.children.length > 0;

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
                onSelect: () => setOpened("close"),
              },
          {
            label: "Delete territory",
            danger: true,
            // Refused while territories sit under it (the owner, 2026-11-24).
            disabled: !canDelete || isRoot || hasChildren,
            onSelect: () => setOpened("delete"),
          },
        ]}
        note={
          isRoot
            ? "This is the organisation itself. It shows the organisation's name and is not changed here."
            : hasChildren && canDelete
              ? "To delete it, first move or delete the territories under it (Edit → Parent territory)."
              : !canEdit && !canSetStatus
                ? "Your role lets you see territories, not change them."
                : undefined
        }
      />

      {opened === "close" && (
        <CloseTerritoryDialog
          territory={territory}
          open
          onOpenChange={(open) => !open && setOpened(null)}
        />
      )}
      {opened === "delete" && (
        <DeleteTerritoryDialog
          territory={territory}
          tree={tree}
          open
          onOpenChange={(open) => !open && setOpened(null)}
          onDeleted={() => void navigate(`/${membership.org_slug}/dms/settings/territories`)}
        />
      )}
    </>
  );
}
