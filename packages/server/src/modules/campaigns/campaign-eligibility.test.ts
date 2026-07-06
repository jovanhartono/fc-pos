import { describe, expect, it } from "bun:test";
import { BadRequestException } from "@/errors";
import { assertCampaignUsable } from "@/modules/campaigns/campaign.service";
import { campaignIneligibilityReason } from "@/schema/campaign-eligibility";

const baseCampaign = {
  code: "SAVE10",
  is_active: true,
  starts_at: null as Date | null,
  ends_at: null as Date | null,
  min_order_total: "0",
  stores: [] as { store_id: number }[],
};

const ctx = {
  now: new Date("2026-06-09T00:00:00Z"),
  grossTotal: 100_000,
  storeId: 1,
  storeCode: "JKT",
};

describe("assertCampaignUsable", () => {
  it("allows an active, in-window, in-store, above-minimum campaign", () => {
    expect(() => assertCampaignUsable(baseCampaign, ctx)).not.toThrow();
  });

  it("rejects an inactive campaign", () => {
    expect(() =>
      assertCampaignUsable({ ...baseCampaign, is_active: false }, ctx)
    ).toThrow(BadRequestException);
  });

  it("rejects a campaign that has not started", () => {
    expect(() =>
      assertCampaignUsable(
        { ...baseCampaign, starts_at: new Date("2026-07-01T00:00:00Z") },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it("rejects a campaign that has ended", () => {
    expect(() =>
      assertCampaignUsable(
        { ...baseCampaign, ends_at: new Date("2026-01-01T00:00:00Z") },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it("rejects a campaign scoped to other stores", () => {
    expect(() =>
      assertCampaignUsable({ ...baseCampaign, stores: [{ store_id: 2 }] }, ctx)
    ).toThrow(BadRequestException);
  });

  it("allows a store-scoped campaign that includes the order's store", () => {
    expect(() =>
      assertCampaignUsable(
        { ...baseCampaign, stores: [{ store_id: 1 }, { store_id: 2 }] },
        ctx
      )
    ).not.toThrow();
  });

  it("rejects when gross total is below the campaign minimum", () => {
    expect(() =>
      assertCampaignUsable({ ...baseCampaign, min_order_total: "200000" }, ctx)
    ).toThrow(BadRequestException);
  });

  it("allows a campaign starting exactly at now (inclusive lower bound)", () => {
    expect(() =>
      assertCampaignUsable({ ...baseCampaign, starts_at: ctx.now }, ctx)
    ).not.toThrow();
  });

  it("allows a campaign ending exactly at now (inclusive upper bound)", () => {
    expect(() =>
      assertCampaignUsable({ ...baseCampaign, ends_at: ctx.now }, ctx)
    ).not.toThrow();
  });

  it("allows a gross total exactly at the campaign minimum", () => {
    expect(() =>
      assertCampaignUsable(
        { ...baseCampaign, min_order_total: String(ctx.grossTotal) },
        ctx
      )
    ).not.toThrow();
  });
});

// The usage-limit gate lives on campaignIneligibilityReason (assertCampaignUsable
// wraps it). It caps LISTED campaigns; vouchers (code mode) enforce their cap
// per-code, so the gate skips them.
const eligibleBase = {
  code: "SAVE10",
  is_active: true,
  starts_at: null as Date | null,
  ends_at: null as Date | null,
  min_order_total: "0",
  stores: [] as { store_id: number }[],
};

describe("campaignIneligibilityReason — usage limit", () => {
  it("allows a listed campaign below its usage limit", () => {
    expect(
      campaignIneligibilityReason(
        {
          ...eligibleBase,
          redemption_mode: "listed",
          usage_limit: 100,
          redeemed_count: 99,
        },
        ctx
      )
    ).toBeNull();
  });

  it("rejects a listed campaign that has reached its usage limit", () => {
    expect(
      campaignIneligibilityReason(
        {
          ...eligibleBase,
          redemption_mode: "listed",
          usage_limit: 100,
          redeemed_count: 100,
        },
        ctx
      )
    ).toBe("Campaign SAVE10 has reached its usage limit");
  });

  it("rejects when redeemed_count has run past the limit", () => {
    expect(
      campaignIneligibilityReason(
        {
          ...eligibleBase,
          redemption_mode: "listed",
          usage_limit: 100,
          redeemed_count: 150,
        },
        ctx
      )
    ).toBe("Campaign SAVE10 has reached its usage limit");
  });

  it("never applies the redeemed_count gate to a voucher (code mode)", () => {
    expect(
      campaignIneligibilityReason(
        {
          ...eligibleBase,
          redemption_mode: "code",
          usage_limit: 5,
          redeemed_count: 999,
        },
        ctx
      )
    ).toBeNull();
  });

  it("has no cap when usage_limit is null", () => {
    expect(
      campaignIneligibilityReason(
        {
          ...eligibleBase,
          redemption_mode: "listed",
          usage_limit: null,
          redeemed_count: 9999,
        },
        ctx
      )
    ).toBeNull();
  });

  it("treats a missing redeemed_count as zero", () => {
    expect(
      campaignIneligibilityReason(
        { ...eligibleBase, redemption_mode: "listed", usage_limit: 5 },
        ctx
      )
    ).toBeNull();
  });
});
