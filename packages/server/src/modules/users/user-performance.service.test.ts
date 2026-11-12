import { describe, expect, it, mock } from "bun:test";

const unused = () => Promise.resolve(null);

mock.module("@/modules/users/user-performance.repository", () => ({
  countCollectedBy: unused,
  countOrdersCreatedBy: unused,
  countPickupNoticesSentBy: unused,
  countPickupsHandedOverBy: unused,
  countQcChecksDoneBy: unused,
  countShiftDays: unused,
}));
mock.module("@/modules/reports/report-range.service", () => ({
  getOwnWorkerFacts: unused,
}));

const { performanceWindows } = await import(
  "@/modules/users/user-performance.service"
);
const { default: dayjs } = await import("dayjs");

describe("the periods on My Performance", () => {
  it("sets the last 7 days against the 7 before", () => {
    expect(performanceWindows("last_7_days", dayjs("2026-11-12"))).toEqual({
      current: { from: "2026-11-06", to: "2026-11-12" },
      previous: { from: "2026-10-30", to: "2026-11-05" },
    });
  });

  // On the 12th, a whole October would make any November look slow.
  it("sets this month so far against the same days last month", () => {
    expect(performanceWindows("this_month", dayjs("2026-11-12"))).toEqual({
      current: { from: "2026-11-01", to: "2026-11-12" },
      previous: { from: "2026-10-01", to: "2026-10-12" },
    });
  });

  it("stops at the end of a shorter last month", () => {
    expect(performanceWindows("this_month", dayjs("2026-03-31"))).toEqual({
      current: { from: "2026-03-01", to: "2026-03-31" },
      previous: { from: "2026-02-01", to: "2026-02-28" },
    });
  });

  it("sets last month against the whole month before", () => {
    expect(performanceWindows("last_month", dayjs("2026-11-12"))).toEqual({
      current: { from: "2026-10-01", to: "2026-10-31" },
      previous: { from: "2026-09-01", to: "2026-09-30" },
    });
  });
});
