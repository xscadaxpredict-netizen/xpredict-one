import { describe, expect, it } from "vitest";

import { amountInWords, integerToIndianWords } from "../format/amountInWords";

describe("amountInWords", () => {
  it.each([
    [920400, "Rupees Nine Lakh Twenty Thousand Four Hundred Only"],
    [780000, "Rupees Seven Lakh Eighty Thousand Only"],
    [897000, "Rupees Eight Lakh Ninety Seven Thousand Only"],
    [1, "Rupees One Only"],
    [0, "Rupees Zero Only"],
    [1250.5, "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only"],
    [0.75, "Seventy Five Paise Only"],
    [0.01, "One Paisa Only"],
    [0.999, "Rupees One Only"],
    [10_000_000, "Rupees One Crore Only"],
    [12_34_56_789, "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only"],
    [100_100, "Rupees One Lakh One Hundred Only"],
  ])("%s -> %s", (amount, words) => {
    expect(amountInWords(amount)).toBe(words);
  });

  it("returns nothing for input a quotation should never print", () => {
    expect(amountInWords(-5)).toBe("");
    expect(amountInWords(Number.NaN)).toBe("");
    expect(amountInWords(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("reads a crore count above 99 in the Indian system", () => {
    expect(integerToIndianWords(1_20_00_00_000)).toBe("One Hundred Twenty Crore");
  });
});
