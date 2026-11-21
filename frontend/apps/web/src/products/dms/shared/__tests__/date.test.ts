import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { formatDate, formatDatePlusDays, formatDateTime } from "../format/date";

// Pin the zone so the expectations below hold on any machine and in CI.
// Node re-reads TZ when it is assigned, so this takes effect immediately.
beforeAll(() => {
  vi.stubEnv("TZ", "Asia/Kolkata");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("formatDate", () => {
  it("shows an API timestamp as a calendar date in local time", () => {
    expect(formatDate("2026-11-07T13:01:13.894873Z")).toBe("07 Nov 2026");
  });

  it("rolls into the next day when IST is past midnight", () => {
    expect(formatDate("2026-11-07T20:00:00Z")).toBe("08 Nov 2026");
  });

  it("keeps a bare calendar date on its own day", () => {
    expect(formatDate("2026-01-05")).toBe("05 Jan 2026");
  });

  it("gives the placeholder for nothing, and passes junk through", () => {
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("", "-")).toBe("-");
    expect(formatDate("not a date")).toBe("not a date");
  });
});

describe("formatDateTime", () => {
  it("adds the local time", () => {
    expect(formatDateTime("2026-11-07T13:01:13.894873Z")).toBe("07 Nov 2026, 6:31 PM");
    expect(formatDateTime("2026-11-06T18:45:00Z")).toBe("07 Nov 2026, 12:15 AM");
  });

  it("does not invent a time for a calendar date", () => {
    expect(formatDateTime("2026-11-07")).toBe("07 Nov 2026");
  });
});

describe("formatDatePlusDays", () => {
  it("is a quotation's validity date", () => {
    expect(formatDatePlusDays("2026-11-07T13:01:13.894873Z", 30)).toBe("07 Dec 2026");
    expect(formatDatePlusDays("2026-12-15", 30)).toBe("14 Jan 2027");
  });
});
