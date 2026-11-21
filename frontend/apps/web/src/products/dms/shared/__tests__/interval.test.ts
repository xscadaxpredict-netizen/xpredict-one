import { describe, expect, it } from "vitest";

import { intervalToDays } from "../format/interval";

describe("intervalToDays", () => {
  it.each([
    ["3 Months", 90],
    ["10 days", 10],
    ["2 weeks", 14],
    ["1 year", 365],
    ["6 month", 180],
    ["30", 30],
    ["45 Days", 45],
    ["monthly", 30],
    ["Quarterly", 90],
    [" 3 months ", 90],
    ["3mo", 90],
  ])("%s -> %d days", (text, days) => {
    expect(intervalToDays(text)).toBe(days);
  });

  it("takes a number of days as-is", () => {
    expect(intervalToDays(15)).toBe(15);
  });

  it("gives null for nothing or nonsense, never a guess", () => {
    expect(intervalToDays("")).toBeNull();
    expect(intervalToDays(null)).toBeNull();
    expect(intervalToDays("soon")).toBeNull();
    expect(intervalToDays("3 fortnights")).toBeNull();
    expect(intervalToDays(0)).toBeNull();
  });
});
