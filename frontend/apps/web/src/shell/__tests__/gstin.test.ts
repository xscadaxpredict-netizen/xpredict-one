/**
 * GSTIN and PAN in the browser (`shell/admin/gstin.ts`): the check digit and
 * the PAN inside a GSTIN. Used by Territory Management's form; the server
 * decides (C19). Kept when the Dealers screen went (2026-11-25).
 */

import { describe, expect, it } from "vitest";

import { extractPan, gstinCheckCharacter, isValidGstin, isValidPan } from "../admin/gstin";

const GSTIN = "33AAPFU0939F1Z2";
const GSTIN_PAN = "AAPFU0939F";
const OTHER_GSTIN = "29AAGCB7383J1Z4";

describe("the GSTIN check digit", () => {
  it("accepts a real GSTIN", () => {
    expect(isValidGstin(GSTIN)).toBe(true);
    expect(isValidGstin(OTHER_GSTIN)).toBe(true);
  });

  it("computes the same check character the number carries", () => {
    expect(gstinCheckCharacter(GSTIN.slice(0, 14))).toBe(GSTIN[14]);
  });

  it("refuses every single-character change to a valid one", () => {
    /*
     * THE PROPERTY THAT MATTERS, and the reason the checksum is worth having
     * at all: a format check passes every one of these. Luhn mod 36 catches
     * the lot, so this asserts none slip through rather than counting how many.
     */
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const accepted: string[] = [];

    for (let i = 0; i < GSTIN.length; i += 1) {
      for (const replacement of alphabet) {
        if (replacement === GSTIN[i]) continue;

        const mutated = GSTIN.slice(0, i) + replacement + GSTIN.slice(i + 1);
        if (isValidGstin(mutated)) accepted.push(mutated);
      }
    }

    expect(accepted).toEqual([]);
  });

  it("refuses a malformed one without throwing", () => {
    for (const value of ["", "NOT-A-GSTIN", "33AAPFU0939F1Z", "33aapfu0939f1z2"]) {
      expect(isValidGstin(value)).toBe(false);
    }
  });

  it("extracts the PAN, and nothing from a half-typed number", () => {
    expect(extractPan(GSTIN)).toBe(GSTIN_PAN);
    expect(isValidPan(extractPan(GSTIN))).toBe(true);
    // Every intermediate value while somebody types is invalid, and a hopeful
    // slice would prefill the PAN with four characters of nonsense.
    expect(extractPan("33AAPFU")).toBe("");
    expect(extractPan("33AAPFU0939F1ZX")).toBe("");
  });
});
