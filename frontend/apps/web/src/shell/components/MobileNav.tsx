/**
 * Navigation on a phone.
 *
 * The desktop rail is 240px wide, which is most of a phone, so it is hidden
 * below 640px — and for a while that was the whole story, which meant there
 * was NO way to reach another module on a phone. You could open an app and
 * then only see whichever screen you landed on.
 *
 * This is that rail again, in a drawer behind a menu button. Same `Sidebar`
 * component, same links, same permission filtering: a second copy of the
 * navigation written for small screens is a second copy to keep in step, and
 * it is always the mobile one that gets forgotten.
 *
 * A dialog rather than a hand-rolled panel, because a drawer over the page has
 * to trap focus, close on Escape, close on the backdrop, stop the page behind
 * it scrolling, and hide that page from screen readers. Radix does all of it.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import type { AppDefinition } from "../navigation";
import { Sidebar } from "./Sidebar";
import styles from "./MobileNav.module.css";

interface MobileNavProps {
  app: AppDefinition;
  orgSlug: string;
}

export function MobileNav({ app, orgSlug }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.trigger} aria-label={`${app.name} navigation`}>
        <MenuIcon />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />

        <Dialog.Content
          className={styles.panel}
          // No description to point at, and Radix warns in development unless
          // it is told that is deliberate.
          aria-describedby={undefined}
        >
          <div className={styles.header}>
            {/* Required by Radix, and useful: the drawer covers the topbar, so
                without it nothing on screen says which app these links are for. */}
            <Dialog.Title className={styles.title}>{app.name}</Dialog.Title>

            <Dialog.Close className={styles.close} aria-label="Close navigation">
              <CloseIcon />
            </Dialog.Close>
          </div>

          <Sidebar
            app={app}
            orgSlug={orgSlug}
            inDrawer
            // Following a link leaves the drawer covering the page you just
            // asked for.
            onNavigate={() => setOpen(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path
        d="m3.5 3.5 7 7m0-7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
