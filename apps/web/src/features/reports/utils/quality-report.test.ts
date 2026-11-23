import { describe, expect, it } from "bun:test";

import type { QualityReport } from "@/features/reports/api";
import { paceText } from "@/features/reports/utils/format";
import {
  outlierFlags,
  QUALITY_RATES,
  rateOf,
  teamOf,
  teamPace,
} from "@/features/reports/utils/quality-report";

type CheckerRow = QualityReport["by_checker"][number];

const checker = (overrides: Partial<CheckerRow>): CheckerRow =>
  ({
    user_id: 1,
    user_name: "Ani",
    checks: 100,
    days_checked: 10,
    per_day: 10,
    passes: 100,
    rejects: 0,
    self_checks: 0,
    complaints_after: 0,
    ...overrides,
  }) as CheckerRow;

// A team whose average day is 10 checks, with 5% self-passed and 5% Complaints,
// so a checker with 100 passes is flagged from 10 of either.
const team = teamOf([
  checker({ checks: 200, days_checked: 20, passes: 200, self_checks: 20 }),
  checker({ checks: 200, days_checked: 20, passes: 200, complaints_after: 20 }),
]);

describe("teamOf", () => {
  it("adds every checker's counts", () => {
    expect(team).toEqual({
      checks: 400,
      days_checked: 40,
      passes: 400,
      rejects: 0,
      self_checks: 20,
      complaints_after: 20,
    });
    expect(teamPace(team)).toBe(10);
  });

  it("is all zeros and no pace with no checkers", () => {
    const empty = teamOf([]);
    expect(empty.checks).toBe(0);
    expect(teamPace(empty)).toBeNull();
  });
});

describe("rateOf", () => {
  it("is null with nothing to divide by", () => {
    const [passRate, selfPassed] = QUALITY_RATES;
    expect(rateOf(passRate, teamOf([]))).toBeNull();
    expect(rateOf(selfPassed, { ...team, passes: 0 })).toBeNull();
  });

  it("counts Self-passed and Complaints out of passes", () => {
    const [, selfPassed, complaints] = QUALITY_RATES;
    const counts = { ...team, checks: 1000, passes: 200 };
    expect(rateOf(selfPassed, counts)).toBe(0.1);
    expect(rateOf(complaints, counts)).toBe(0.1);
  });
});

describe("outlierFlags", () => {
  const slow = `slow · team ${paceText(10)}`;

  it("flags nobody who works like the team", () => {
    expect(outlierFlags(checker({}), team)).toEqual([]);
  });

  describe("slow", () => {
    it("flags under half the team's pace", () => {
      expect(outlierFlags(checker({ per_day: 4.9 }), team)).toEqual([slow]);
    });

    it("leaves exactly half the team's pace alone", () => {
      expect(outlierFlags(checker({ per_day: 5 }), team)).toEqual([]);
    });

    it("needs three days checked", () => {
      expect(
        outlierFlags(checker({ per_day: 1, days_checked: 2 }), team)
      ).toEqual([]);
      expect(
        outlierFlags(checker({ per_day: 1, days_checked: 3 }), team)
      ).toEqual([slow]);
    });
  });

  describe("self-passes a lot", () => {
    it("flags twice the team's rate", () => {
      expect(outlierFlags(checker({ self_checks: 10 }), team)).toEqual([
        "self-passes a lot",
      ]);
    });

    it("leaves just under twice the team's rate alone", () => {
      expect(outlierFlags(checker({ self_checks: 9 }), team)).toEqual([]);
    });

    it("flags just over twice the team's rate", () => {
      expect(outlierFlags(checker({ self_checks: 11 }), team)).toEqual([
        "self-passes a lot",
      ]);
    });

    it("needs three self-passes", () => {
      const small = { checks: 10, passes: 10, days_checked: 1, per_day: 10 };
      expect(outlierFlags(checker({ ...small, self_checks: 2 }), team)).toEqual(
        []
      );
      expect(outlierFlags(checker({ ...small, self_checks: 3 }), team)).toEqual(
        ["self-passes a lot"]
      );
    });
  });

  describe("many Complaints", () => {
    it("flags twice the team's rate", () => {
      expect(outlierFlags(checker({ complaints_after: 10 }), team)).toEqual([
        "many Complaints",
      ]);
    });

    it("leaves just under twice the team's rate alone", () => {
      expect(outlierFlags(checker({ complaints_after: 9 }), team)).toEqual([]);
    });

    it("flags just over twice the team's rate", () => {
      expect(outlierFlags(checker({ complaints_after: 11 }), team)).toEqual([
        "many Complaints",
      ]);
    });

    it("needs two Complaints", () => {
      const small = { checks: 10, passes: 10, days_checked: 1, per_day: 10 };
      expect(
        outlierFlags(checker({ ...small, complaints_after: 1 }), team)
      ).toEqual([]);
      expect(
        outlierFlags(checker({ ...small, complaints_after: 2 }), team)
      ).toEqual(["many Complaints"]);
    });
  });

  it("never flags rejects: a checker who rejects a lot may just be strict", () => {
    expect(outlierFlags(checker({ passes: 10, rejects: 90 }), team)).toEqual(
      []
    );
  });

  it("flags nothing in a team of one, who is the team", () => {
    const alone = checker({
      per_day: 1,
      days_checked: 10,
      checks: 10,
      passes: 10,
      self_checks: 5,
      complaints_after: 5,
    });
    expect(outlierFlags(alone, teamOf([alone]))).toEqual([]);
  });
});
