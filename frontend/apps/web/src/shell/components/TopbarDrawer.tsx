/**
 * A panel that slides in at the right edge, under the topbar, from a button in
 * the topbar — the apps list and the account panel both open this way, as Zoho's
 * do. One component so the two cannot drift apart in size, position or how they
 * close.
 *
 * A Radix dialog, NON-MODAL, rather than a popover. A popover is positioned
 * against its button, so it floated under the icon instead of standing against
 * the edge of the window. Non-modal because the topbar has to stay usable while
 * one is open: pressing the other button closes this one and opens that one,
 * which a modal dialog would block.
 *
 * Escape, a click outside, and the close button all close it; focus goes back
 * to the button that opened it.
 */

import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import styles from "./TopbarDrawer.module.css";

interface TopbarDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The topbar button's accessible name. */
  triggerLabel: string;
  triggerClassName?: string;
  /** What the topbar button shows — an icon or the avatar. */
  triggerContent: ReactNode;
  /**
   * Said on hover and keyboard focus. Separate from `triggerLabel` because the
   * two are for different people: the label is what a screen reader reads and
   * may carry detail ("Notifications, 3 unread"), the tooltip is a word or two
   * for somebody wondering what an icon is.
   */
  tooltip: string;
  /** Where focus lands on opening. Defaults to the first focusable element. */
  onOpenAutoFocus?: (event: Event) => void;
  /** Call `preventDefault()` to keep the drawer open on this Escape. */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  /** Must include a `DrawerTitle`: it is the panel's accessible name. */
  children: ReactNode;
}

export function TopbarDrawer({
  open,
  onOpenChange,
  triggerLabel,
  triggerClassName,
  triggerContent,
  tooltip,
  onOpenAutoFocus,
  onEscapeKeyDown,
  children,
}: TopbarDrawerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [notchRight, setNotchRight] = useState<number>();
  const [tipOpen, setTipOpen] = useState(false);
  /*
   * Closing the drawer hands focus back to the button, and a tooltip opens on
   * focus — so without this it would pop up every time a drawer closed. It
   * stays quiet until the pointer or the focus has left the button once.
   */
  const quietTip = useRef(false);

  function changeOpen(next: boolean) {
    if (!next) quietTip.current = true;
    setTipOpen(false);
    onOpenChange(next);
  }

  /*
   * The notch at the top of the panel points at the button that opened it. The
   * panel is pinned to the window's edge, not to the button, so where the
   * button sits is measured each time the panel opens.
   */
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setNotchRight(document.documentElement.clientWidth - (rect.left + rect.width / 2));
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen} modal={false}>
      <Tooltip.Provider delayDuration={400}>
        <Tooltip.Root
          // Never while the drawer is open: it would sit on top of the notch,
          // telling somebody the name of the thing they are looking at.
          open={tipOpen && !open}
          onOpenChange={(next) => {
            if (next && quietTip.current) return;
            setTipOpen(next);
          }}
        >
          <Tooltip.Trigger asChild>
            <Dialog.Trigger
              ref={triggerRef}
              className={triggerClassName}
              aria-label={triggerLabel}
              onPointerLeave={() => {
                quietTip.current = false;
              }}
              onBlur={() => {
                quietTip.current = false;
              }}
            >
              {triggerContent}
            </Dialog.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className={styles.tooltip} side="bottom" sideOffset={6}>
              {tooltip}
              <Tooltip.Arrow className={styles.tooltipArrow} width={10} height={5} />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>

      <Dialog.Portal>
        {/* Dims the page under the topbar. Purely visual: a click here is a
            click outside, which already closes the panel. */}
        <div className={styles.scrim} aria-hidden="true" />

        <Dialog.Content
          className={styles.drawer}
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          onEscapeKeyDown={onEscapeKeyDown}
        >
          {notchRight !== undefined && (
            <span className={styles.notch} style={{ right: notchRight }} aria-hidden="true" />
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The drawer's name. Every drawer has exactly one. */
export const DrawerTitle = Dialog.Title;

/** The close button inside a drawer. */
export const DrawerClose = Dialog.Close;
