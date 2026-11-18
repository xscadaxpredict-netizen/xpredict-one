/**
 * The ⋮ for one application, on its row in the Applications list and in the
 * header of its side panel (C78).
 *
 * "Assign users" is THE MENU ONLY for now (the owner, 2026-11-17) — choosing
 * it closes the menu and does nothing yet. Disabled on an app the
 * organisation does not subscribe to: nobody can be given an app it has not
 * bought (C55), so offering it there would promise something the backend
 * refuses.
 */

import type { Application } from "../api/applications";
import { RowMenu } from "./RowMenu";

export function ApplicationActions({ app }: { app: Application }) {
  return (
    <RowMenu
      label={`More actions for ${app.name}`}
      items={[{ label: "Assign users", disabled: !app.active }]}
    />
  );
}
