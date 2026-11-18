/**
 * The ⋮ for one person: Edit, Deactivate (or Reactivate) and Delete — on their
 * row in the Users list and in the header of their side panel, so the two
 * always offer the same things in the same words (C78).
 *
 *   Edit         the edit dialog.
 *   Deactivate   switches them off; "Reactivate" for somebody already off.
 *                Not offered for a pending invitation (nobody to switch off
 *                yet — Delete cancels it) or for the owner.
 *   Delete       the remove dialog: removes them from the organisation, or
 *                cancels a pending invitation. Their account is not deleted,
 *                which the dialog says. Never the owner.
 *
 * Greying the owner's items is courtesy, not the rule: the backend refuses
 * both with a 409 regardless (C14, C41). The menu says why.
 */

import { asProblem } from "@xpredict/api-client";
import { useState } from "react";

import type { Membership } from "../../api/auth";
import type { OrgUser } from "../api/users";
import { useSetUserStatus } from "../hooks/useUsers";
import { EditUserDialog } from "./EditUserDialog";
import { RemoveUserDialog } from "./RemoveUserDialog";
import { RowMenu } from "./RowMenu";

interface UserActionsProps {
  user: OrgUser;
  membership: Membership;
  /** After they are deleted — closes their panel if it was open. */
  onRemoved: () => void;
  /** A failed (re)activation, in words, or null once one succeeds. */
  onStatusError: (message: string | null) => void;
}

/** "Asha Rao", or their address when they have not given a name yet. */
export function displayName(user: Pick<OrgUser, "first_name" | "last_name" | "email">): string {
  return `${user.first_name} ${user.last_name}`.trim() || user.email;
}

export function UserActions({ user, membership, onRemoved, onStatusError }: UserActionsProps) {
  const [opened, setOpened] = useState<"edit" | "remove" | null>(null);
  const { mutate: setStatus, isPending } = useSetUserStatus();

  const isOwner = user.role === "owner";
  const isOff = user.status === "disabled";

  return (
    <>
      <RowMenu
        label={`More actions for ${displayName(user)}`}
        items={[
          { label: "Edit", onSelect: () => setOpened("edit") },
          {
            label: isOff ? "Reactivate" : "Deactivate",
            disabled: isOwner || user.status === "invited" || isPending,
            onSelect: () =>
              setStatus(
                { userId: user.id, status: isOff ? "active" : "disabled" },
                {
                  onSuccess: () => onStatusError(null),
                  onError: (error) => onStatusError(asProblem(error).detail),
                },
              ),
          },
          {
            label: "Delete",
            danger: true,
            disabled: isOwner,
            onSelect: () => setOpened("remove"),
          },
        ]}
        note={
          isOwner
            ? "The owner cannot be deactivated or deleted. Transfer ownership first."
            : undefined
        }
      />

      {opened === "edit" && (
        <EditUserDialog
          user={user}
          membership={membership}
          open
          onOpenChange={(open) => !open && setOpened(null)}
        />
      )}
      {opened === "remove" && (
        <RemoveUserDialog
          user={user}
          orgName={membership.org_name}
          onRemoved={onRemoved}
          open
          onOpenChange={(open) => !open && setOpened(null)}
        />
      )}
    </>
  );
}
