/**
 * Grouping a problem response's field errors.
 *
 * SMALL, AND IT EARNED ITS OWN FILE because two screens depend on it and the
 * interesting case is invisible from either: one field with several reasons.
 * `12345678` fails two password validators at once, and both screens used to
 * assign them one after another, keeping whichever came last -- so somebody
 * would fix the digits and only then be told it was also too common.
 */

import { describe, expect, it } from "vitest";

import { messagesByField } from "../fieldErrors";

describe("messagesByField", () => {
  it("joins several reasons for one field", () => {
    const grouped = messagesByField([
      { field: "password", code: "invalid", detail: "This password is too common." },
      { field: "password", code: "invalid", detail: "This password is entirely numeric." },
    ]);

    expect(grouped.get("password")).toBe(
      "This password is too common. This password is entirely numeric.",
    );
  });

  it("keeps fields apart", () => {
    const grouped = messagesByField([
      { field: "password", code: "invalid", detail: "Too short." },
      { field: "email", code: "invalid", detail: "Not an address." },
    ]);

    expect(grouped.get("password")).toBe("Too short.");
    expect(grouped.get("email")).toBe("Not an address.");
    expect(grouped.size).toBe(2);
  });

  it("is empty for a failure that carries no field errors", () => {
    /*
     * Most refusals in this system are domain errors with a useful `detail`
     * and no `errors` at all -- a taken address, a closed enquiry. Callers
     * fall back to the banner, so this has to be empty rather than throw.
     */
    expect(messagesByField(undefined).size).toBe(0);
    expect(messagesByField([]).size).toBe(0);
  });

  it("preserves the order the server sent", () => {
    // The validators run in the order `AUTH_PASSWORD_VALIDATORS` lists them,
    // which is roughly cheapest-to-explain first. Reordering would be
    // gratuitous.
    const grouped = messagesByField([
      { field: "password", code: "invalid", detail: "First." },
      { field: "password", code: "invalid", detail: "Second." },
      { field: "password", code: "invalid", detail: "Third." },
    ]);

    expect(grouped.get("password")).toBe("First. Second. Third.");
  });
});
