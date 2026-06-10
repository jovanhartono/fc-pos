import { describe, expect, it } from "bun:test";
import { BadRequestException } from "@/errors";
import { assertCampaignUsable } from "@/modules/campaigns/campaign.service";

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
