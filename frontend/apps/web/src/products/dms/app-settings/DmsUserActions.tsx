/**
 * The ⋮ on a DMS settings -> Users row, and on the person's panel: Edit,
 * Deactivate / Activate, Delete (the owner, 2026-11-24) -- the Admin panel's
 * `UserActions`, acting on the person's DMS rather than their account:
 *
 *   Edit       -- details and DMS role                (`dms.user.update`)
 *   Deactivate -- DMS off, role and place kept        (`dms.user.deactivate`)
 *   Delete     -- DMS taken away; they stay in the org (`dms.user.delete`)
 *
 * GREYED, NOT HIDDEN, as the Admin panel's: for the OWNER (who holds every app
 * by rule, and whom the server refuses), for Deactivate on somebody PENDING
 * (nothing to switch off before they join), and for anything this person may
 * not do. Every one is also refused by the server; this is the screen agreeing.
 */

import { useState } from "react";
import { asProblem } from "@xpredict/api-client";

import { useAccess } from "../../../shell/access";
import { RowMenu } from "@xpredict/ui";
import type { AppUser } from "./api";
import { EditDmsUserDialog } from "./EditDmsUserDialog";
import { RemoveDmsUserDialog } from "./RemoveDmsUserDialog";
import { useSetDmsUserStatus } from "./useDmsUsers";

interface DmsUserActionsProps {
  user: AppUser;
  /** After Delete: closes their panel if it was open. */
  onRemoved: () => void;
  /** Where a refused Deactivate / Activate is said (null clears it). */
  onStatusError: (message: string | null) => void;
}

/** Their name, or their email while they have none (somebody added unnamed). */
export function displayName(user: Pick<AppUser, "first_name" | "last_name" | "email">): string {
  return `${user.first_name} ${user.last_name}`.trim() || user.email;
}

export function DmsUserActions({ user, onRemoved, onStatusError }: DmsUserActionsProps) {
  const [opened, setOpened] = useState<"edit" | "remove" | null>(null);
  const { mutate: setStatus, isPending } = useSetDmsUserStatus();
  const access = useAccess();
  const canEdit = access.can("dms.user.update");
  const canSwitch = access.can("dms.user.deactivate");
  const canDelete = access.can("dms.user.delete");

  const isOff = user.access_status === "disabled";
  const name = displayName(user);

  return (
    <>
      <RowMenu
        label={`More actions for ${name}`}
        items={[
          { label: "Edit", disabled: !canEdit || user.is_owner, onSelect: () => setOpened("edit") },
          {
            label: isOff ? "Activate" : "Deactivate",
            disabled: !canSwitch || user.is_owner || user.status === "pending" || isPending,
            onSelect: () =>
              setStatus(
                { userId: user.id, action: isOff ? "activate" : "deactivate" },
                {
                  onSuccess: () => onStatusError(null),
                  onError: (error) => onStatusError(asProblem(error).detail),
                },
              ),
          },
          {
            label: "Delete",
            danger: true,
            disabled: !canDelete || user.is_owner,
            onSelect: () => setOpened("remove"),
          },
        ]}
        note={
          user.is_owner
            ? "The owner holds every app by default, so they cannot be changed here."
            : user.status === "pending"
              ? "They have not joined yet, so there is no DMS to deactivate."
              : !canEdit && !canSwitch && !canDelete
                ? "Your role lets you view people, not change them."
                : undefined
        }
      />

      {opened === "edit" && (
        <EditDmsUserDialog user={user} open onOpenChange={(open) => !open && setOpened(null)} />
      )}
      {opened === "remove" && (
        <RemoveDmsUserDialog
          user={user}
          name={name}
          open
          onOpenChange={(open) => !open && setOpened(null)}
          onRemoved={onRemoved}
        />
      )}
    </>
  );
}
