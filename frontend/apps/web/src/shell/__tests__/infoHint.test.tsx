/**
 * `InfoHint` — the "i" that replaced the paragraph under each Administration
 * heading.
 *
 * THIS FILE EXISTS BECAUSE THE COMPONENT TOOK THREE GOES. The first version
 * used a Radix `Tooltip`, which closes itself on pointer-down, so clicking it
 * did nothing and touch had no way in at all. The second moved to `Popover`
 * with an `Anchor`, which fixed click and silently broke the keyboard: Radix
 * treats the anchor as OUTSIDE the popover, so tabbing to the button opened
 * the hint and dismissed it in the same breath.
 *
 * Both failures were invisible — no error, no console warning, just a control
 * that did nothing for one group of people. So the three ways in are asserted
 * separately rather than trusting one of them to stand for the others.
 *
 * WHAT IS NOT TESTED HERE: hover. jsdom has no pointer, and a fake
 * `pointerenter` does not reach React's delegated listener, so a hover test
 * would assert the mock rather than the behaviour. It was verified in a real
 * browser instead, which is also where both bugs above were found.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InfoHint } from "@xpredict/ui";

const TEXT = "People belong to the organisation; only DMS scopes them to a dealer.";

function renderHint() {
  return render(<InfoHint label="About the Users screen">{TEXT}</InfoHint>);
}

describe("InfoHint", () => {
  it("renders a real button with an accessible name", () => {
    renderHint();

    const trigger = screen.getByRole("button", { name: "About the Users screen" });

    // A <button>, not a <span> with a click handler: it has to be reachable by
    // Tab and announced as something you can operate.
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("says nothing until it is asked", () => {
    renderHint();

    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it("opens on click, which is the only way in on a touch screen", async () => {
    renderHint();

    fireEvent.click(screen.getByRole("button", { name: "About the Users screen" }));

    expect(await screen.findByText(TEXT)).toBeInTheDocument();
  });

  it("closes on a second click", async () => {
    renderHint();
    const trigger = screen.getByRole("button", { name: "About the Users screen" });

    fireEvent.click(trigger);
    await screen.findByText(TEXT);

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    });
  });

  it("opens on focus, so a keyboard reaches it too", async () => {
    /*
     * THE REGRESSION THIS FILE WAS WRITTEN FOR. With `Popover.Anchor`, Radix
     * counts focus on the trigger as focus OUTSIDE the popover and dismisses
     * it, so this opened and closed instantly until `onFocusOutside` was
     * prevented. Clicking still worked throughout, which is what made it easy
     * to miss.
     */
    renderHint();

    fireEvent.focus(screen.getByRole("button", { name: "About the Users screen" }));

    expect(await screen.findByText(TEXT)).toBeInTheDocument();
  });

  it("closes again when focus leaves", async () => {
    renderHint();
    const trigger = screen.getByRole("button", { name: "About the Users screen" });

    fireEvent.focus(trigger);
    await screen.findByText(TEXT);

    fireEvent.blur(trigger);

    await waitFor(() => {
      expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    });
  });

  it("stays open when focus leaves after a click", async () => {
    /*
     * A click PINS it. Without this, tapping the icon on a phone and then
     * touching anything else would close the thing you just opened — and on a
     * touch screen there is no hover to reopen it with.
     */
    renderHint();
    const trigger = screen.getByRole("button", { name: "About the Users screen" });

    fireEvent.click(trigger);
    await screen.findByText(TEXT);

    fireEvent.blur(trigger);

    // Still there a tick later, rather than "not yet removed".
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(TEXT)).toBeInTheDocument();
  });
});
