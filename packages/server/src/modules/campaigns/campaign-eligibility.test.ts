import { describe, expect, it } from "bun:test";
import { BadRequestException } from "@/http-exceptions";
import { assertCampaignUsable } from "@/modules/campaigns/campaign.service";
import { campaignIneligibilityReason } from "@/schema/campaign-eligibility";

const baseCampaign = {
  buy_quantity: null as number | null,
  code: "SAVE10",
  discount_type: "fixed" as const,
  eligibleServices: [] as { service_id: number }[],
  is_active: true,
  starts_at: null as Date | null,
  ends_at: null as Date | null,
  free_quantity: null as number | null,
  min_order_total: "0",
  stores: [] as { store_id: number }[],
};

const ctx = {
  now: new Date("2026-06-09T00:00:00Z"),
  grossTotal: 100_000,
  lines: [] as { service_id: number }[],
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

// The Usage limit caps listed Campaigns only; a Voucher is capped by its
// single-use codes, so the check skips it.
const eligibleBase = {
  code: "SAVE10",
  discount_type: "fixed" as const,
  eligibleServices: [] as { service_id: number }[],
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

const DEEP_CLEAN = 21;
const UNYELLOWING = 22;

const slots = (...serviceIds: number[]) =>
  serviceIds.map((service_id) => ({ service_id }));

// The cashier only sees "Buy 4 Get 1" once five eligible Services are in the
// Cart; at three, the tile would promise a free Item the Order can't earn.
describe("campaignIneligibilityReason — eligible Services", () => {
  const buy4get1 = {
    ...eligibleBase,
    code: "B4G1",
    discount_type: "buy_n_get_m_free" as const,
    buy_quantity: 4,
    free_quantity: 1,
    eligibleServices: [{ service_id: DEEP_CLEAN }],
  };
  const fixedOnDeepClean = {
    ...eligibleBase,
    eligibleServices: [{ service_id: DEEP_CLEAN }],
  };

  it("refuses buy 4 get 1 with three eligible Services", () => {
    expect(
      campaignIneligibilityReason(buy4get1, {
        ...ctx,
        lines: slots(DEEP_CLEAN, DEEP_CLEAN, DEEP_CLEAN),
      })
    ).toBe("Campaign B4G1 needs 5 eligible Services");
  });

  it("allows buy 4 get 1 with five eligible Services", () => {
    expect(
      campaignIneligibilityReason(buy4get1, {
        ...ctx,
        lines: slots(
          DEEP_CLEAN,
          DEEP_CLEAN,
          DEEP_CLEAN,
          DEEP_CLEAN,
          DEEP_CLEAN
        ),
      })
    ).toBeNull();
  });

  it("doesn't count Services outside the Campaign toward buy 4 get 1", () => {
    expect(
      campaignIneligibilityReason(buy4get1, {
        ...ctx,
        lines: slots(
          DEEP_CLEAN,
          DEEP_CLEAN,
          DEEP_CLEAN,
          UNYELLOWING,
          UNYELLOWING
        ),
      })
    ).toBe("Campaign B4G1 needs 5 eligible Services");
  });

  // The Campaign form hides Eligible services for fixed and percentage, so a
  // list left over from a type change must not hide the Campaign.
  it("ignores Services for a fixed Campaign", () => {
    expect(
      campaignIneligibilityReason(fixedOnDeepClean, {
        ...ctx,
        lines: slots(UNYELLOWING),
      })
    ).toBeNull();
  });
});
