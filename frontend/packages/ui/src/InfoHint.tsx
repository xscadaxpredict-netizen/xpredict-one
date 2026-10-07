/**
 * A small "i" beside a heading that explains the screen.
 *
 * WHY IT EXISTS. Each Administration screen carried a two-line paragraph
 * explaining the model — that a person belongs to the organisation and only
 * DMS narrows them to a dealer, and so on. All three are worth saying and none
 * is worth saying every time somebody opens the page: once you know it, it is
 * furniture. The owner asked for it folded behind an icon.
 *
 * THE EXPLANATION IS NOT ESSENTIAL, and that is what makes hiding it safe.
 * Nothing here tells somebody how to complete a task; it explains a model they
 * will meet anyway. Had it been an instruction, hiding it behind a hover would
 * be the wrong call whatever it did for the layout.
 *
 * IT OPENS THREE WAYS, because hover alone reaches the fewest people:
 *
 *   hover   — a mouse, which is what was asked for.
 *   focus   — Tab lands on a real <button> and it opens.
 *   click   — and therefore tap. Hover does not exist on a phone, and the
 *             shell has a mobile drawer, so phones are a real case here.
 *             A click PINS it open until it is clicked again, dismissed, or
 *             Escape is pressed.
 *
 * WHY POPOVER AND NOT TOOLTIP. This was written on `Tooltip` first, and
 * clicking it did nothing: a Radix tooltip closes itself on pointer-down by
 * design, so a controlled `open` that a click toggles is immediately overruled.
 * That is correct behaviour for a tooltip and it leaves touch with no way in.
 * `Popover` is the primitive meant for click, and it brings outside-click and
 * Escape with it.
 *
 * `Popover.Anchor` RATHER THAN `Popover.Trigger`, deliberately: the trigger
 * toggles `open` itself, which fights the hover handlers for the same reason
 * the tooltip did. The anchor only positions, so this component owns the state
 * outright and there is one rule for when it is open.
 */

import * as Popover from "@radix-ui/react-popover";
import { useState, type ReactNode } from "react";

import styles from "./InfoHint.module.css";

export interface InfoHintProps {
  /** What the icon explains. Prose, not a label. */
  children: ReactNode;
  /**
   * The accessible name of the trigger — "About this screen", not "info".
   *
   * Defaulted rather than required because every caller so far wants the same
   * thing, and a required prop that is always given the same value is a prop
   * that will eventually be given a wrong one.
   */
  label?: string;
}

export function InfoHint({ children, label = "About this screen" }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  /*
   * Pinned by a click, so moving the pointer away does not take it back. A
   * hover-opened hint closes when the pointer leaves; a clicked one stays
   * until it is dismissed, which is the only behaviour that works on a touch
   * screen — there is no "leave" there.
   */
  const [pinned, setPinned] = useState(false);

  function close() {
    setOpen(false);
    setPinned(false);
  }

  return (
    <Popover.Root
      open={open}
      // Fires for Escape and for a click outside, which are Popover's to
      // handle and the reason this is not hand-rolled.
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <Popover.Anchor asChild>
        <button
          type="button"
          className={styles.trigger}
          aria-label={label}
          aria-expanded={open}
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => !pinned && setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => !pinned && setOpen(false)}
          onClick={() => {
            if (pinned) {
              close();
            } else {
              setPinned(true);
              setOpen(true);
            }
          }}
        >
          <InfoIcon />
        </button>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          className={styles.content}
          side="bottom"
          align="start"
          sideOffset={6}
          // Opening on hover must NOT move the keyboard somewhere else. Without
          // this, drifting the pointer over the icon pulls focus out of
          // whatever the person was typing in.
          onOpenAutoFocus={(event) => event.preventDefault()}
          /*
           * THE BUTTON IS "OUTSIDE" AS FAR AS RADIX IS CONCERNED, because this
           * uses `Anchor` rather than `Trigger` — an anchor only positions, so
           * Radix does not count it as part of the popover's interaction scope.
           *
           * Without this, tabbing to the button opened the hint and dismissed
           * it in the same breath: focus landed on an element Radix considered
           * outside, which is its cue to close. Keyboard users got nothing and
           * nothing in the console said why.
           *
           * Dismissal still works — Escape and a pointer-down outside both
           * close it. Only the focus-driven route is suppressed, and it has to
           * be, because the control that opens this can never be inside it.
           */
          onFocusOutside={(event) => event.preventDefault()}
          // The content is prose with nothing to click, so there is no reason
          // for the pointer to travel into it and every reason not to trap it.
          onPointerDownOutside={close}
        >
          {children}
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/*
 * A circled "i" — the one icon people already read as "explain this", which
 * matters more here than drawing something prettier. `aria-hidden` because the
 * button above carries the name; announcing both would say it twice.
 */
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="5" r="0.9" fill="currentColor" />
      <path
        d="M8 7.3v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
