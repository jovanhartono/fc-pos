// Pins the pure date math every revenue report leans on: Jakarta day
// attribution, the previous-period comparison window, granularity picking,
// and gap-free bucket enumeration. A one-day drift moves money between
// business days; an ISO-week mismatch with Postgres to_char('IYYY-IW') dumps
// New Year revenue into a phantom week. Everything runs real — no mocks.
// jakartaBucketExpr is deliberately untested (it needs a live PgColumn);
// its drift risk is pinned via the bucketFormat contract and the ISO-week
// agreement tests instead.
import { describe, expect, it } from "bun:test";
import {
  bucketFormat,
  daysBetween,
  dayToBucket,
  deltaPct,
  derivePreviousRange,
  enumerateBuckets,
  enumerateDays,
  getJakartaDayRange,
  getJakartaRange,
  pickGranularity,
  shiftDate,
} from "@/modules/reports/report-range.util";

describe("getJakartaDayRange", () => {
  it("bounds Aug 1 so a 23:30-on-Jul-31 payment stays in July", () => {
    const { start, end } = getJakartaDayRange("2026-08-01");
    expect(start).toEqual(new Date("2026-07-31T17:00:00.000Z"));
    // Half-open: the boundary instant belongs to the next day, never both.
    expect(end).toEqual(new Date("2026-08-01T17:00:00.000Z"));
  });
});

describe("getJakartaRange", () => {
  it("keeps a 23:59 payment on the report's last day inside the month", () => {
    const { start, end } = getJakartaRange("2026-07-01", "2026-07-31");
    expect(start).toEqual(new Date("2026-06-30T17:00:00.000Z"));
    expect(end).toEqual(new Date("2026-07-31T17:00:00.000Z"));
  });
});

describe("daysBetween", () => {
  it("counts a single-day report as one day, not zero", () => {
    expect(daysBetween("2026-08-01", "2026-08-01")).toBe(1);
  });
});

describe("derivePreviousRange", () => {
  it("compares July against the equal-length window ending right before it", () => {
    // No gap, no overlap — otherwise growth vs last period double-counts
    // or silently drops days.
    expect(derivePreviousRange("2026-07-01", "2026-07-31")).toEqual({
      from: "2026-05-31",
      to: "2026-06-30",
    });
  });

  it("compares today against yesterday for a single-day report", () => {
    expect(derivePreviousRange("2026-08-01", "2026-08-01")).toEqual({
      from: "2026-07-31",
      to: "2026-07-31",
    });
  });
});

describe("pickGranularity", () => {
  it("switches day to week just past a full month", () => {
    expect(pickGranularity("2026-07-01", "2026-07-31")).toBe("day");
    expect(pickGranularity("2026-07-01", "2026-08-01")).toBe("week");
  });

  it("switches week to month just past 120 days", () => {
    expect(pickGranularity("2026-01-01", "2026-04-30")).toBe("week");
    expect(pickGranularity("2026-01-01", "2026-05-01")).toBe("month");
  });

  it("switches month to year just past two years", () => {
    expect(pickGranularity("2025-01-01", "2026-12-31")).toBe("month");
    expect(pickGranularity("2025-01-01", "2027-01-01")).toBe("year");
  });
});

describe("dayToBucket", () => {
  // JS must agree with Postgres to_char(IYYY-IW), or the New Year's rush
  // lands in a week the report never enumerates and vanishes from the chart.
  it("files Dec 29 2025 under 2026 week 1", () => {
    expect(dayToBucket("2025-12-29", "week")).toBe("2026-01");
  });

  it("files Jan 1 2027 under 2026 week 53", () => {
    expect(dayToBucket("2027-01-01", "week")).toBe("2026-53");
  });

  it("keeps Sunday Jan 4 2026 in week 1 with the rest of its week", () => {
    // Sunday closes the ISO week. Treat it as the week's opener instead and
    // every Sunday's takings slide into the next week's bar while Postgres
    // keeps them here — the busiest laundry day vanishes from its own week.
    expect(dayToBucket("2026-01-04", "week")).toBe("2026-01");
  });
});

describe("enumerateBuckets", () => {
  it("lists every month the range touches, partial months included", () => {
    // A quarter opened mid-January must still chart January's tail revenue.
    expect(enumerateBuckets("2026-01-15", "2026-04-02", "month")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });
});

describe("enumerateDays", () => {
  it("does not skip Feb 29 revenue in a leap year", () => {
    expect(enumerateDays("2028-02-28", "2028-03-01")).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });
});

describe("shiftDate", () => {
  it("steps onto the leap day instead of jumping past it", () => {
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("rolls across month and year boundaries", () => {
    expect(shiftDate("2028-02-29", 1)).toBe("2028-03-01");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("deltaPct", () => {
  it("reports 20% growth as exactly 0.2", () => {
    expect(deltaPct(120_000, 100_000)).toBe(0.2);
  });

  it("returns null when the previous period had no sales", () => {
    // A store's first month must never show Infinity% growth on the card.
    expect(deltaPct(50_000, 0)).toBeNull();
  });
});

describe("bucketFormat", () => {
  it("matches the to_char formats the SQL side groups by", () => {
    // These strings keep DB rows joinable to the enumerated buckets.
    expect(bucketFormat("day")).toBe("YYYY-MM-DD");
    expect(bucketFormat("week")).toBe("IYYY-IW");
    expect(bucketFormat("month")).toBe("YYYY-MM");
    expect(bucketFormat("year")).toBe("YYYY");
  });
});
