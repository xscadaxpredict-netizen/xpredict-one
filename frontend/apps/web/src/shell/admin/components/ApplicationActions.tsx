/**
 * The ⋮ for one application, on its row in the Applications list and in the
 * header of its side panel (C78) -- one component, so both work the same.
 *
 * "Assign users" opens `AssignUsersDialog` (the owner, 2026-11-20). Greyed:
 *
 *   - on an app the organisation does not subscribe to: nobody can be given
 *     an app it has not bought (C55), so offering it would promise something
 *     the backend refuses;
 *   - without `admin.user.assign_app` -- the same act as Assign applications,
 *     so the same permission -- and `admin.user.view`, since the dialog picks
 *     from the Users list (C81).
 */

import { useState } from "react";

import { useAccess } from "../../access";
import type { Application } from "../api/applications";
import { AssignUsersDialog } from "./AssignUsersDialog";
import { RowMenu } from "@xpredict/ui";

export function ApplicationActions({ app }: { app: Application }) {
  const access = useAccess();
  const [assigning, setAssigning] = useState(false);
  const allowed = access.can("admin.user.view") && access.can("admin.user.assign_app");

  return (
    <>
      <RowMenu
        label={`More actions for ${app.name}`}
        items={[
          {
            label: "Assign users",
            disabled: !app.active || !allowed,
            onSelect: () => setAssigning(true),
          },
        ]}
      />
      <AssignUsersDialog app={app} open={assigning} onOpenChange={setAssigning} />
    </>
  );
}
