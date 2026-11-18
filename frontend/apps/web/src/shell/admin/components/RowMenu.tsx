/**
 * The ⋮ at the end of a row on an Admin panel list page (C78): the row's
 * actions, in a menu. One component so every list's ⋮ looks and behaves the
 * same — Applications' "Assign users", Users' Edit / Deactivate / Delete.
 *
 * NOT MODAL (`modal={false}`). An item may open a dialog, and a modal menu
 * closing underneath a dialog that is opening leaves the page unclickable —
 * a known Radix trap. Nothing is lost: Escape and clicking outside still close
 * the menu.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EllipsisVerticalIcon } from "lucide-react";

import styles from "./RowMenu.module.css";

export interface RowMenuItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Something that cannot be undone from here, like Delete. */
  danger?: boolean;
}

interface RowMenuProps {
  /** Names the button: "More actions for DMS". */
  label: string;
  items: RowMenuItem[];
  /** A line under the items saying why some are greyed out. */
  note?: string;
}

export function RowMenu({ label, items, note }: RowMenuProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className={styles.trigger}
        aria-label={label}
        // Inside a clickable row: opening the menu must not also open the row.
        onClick={(event) => event.stopPropagation()}
      >
        <EllipsisVerticalIcon size={18} aria-hidden="true" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              className={styles.item}
              data-danger={item.danger || undefined}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
          {note && <p className={styles.note}>{note}</p>}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
