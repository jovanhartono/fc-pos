import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { DbExecutor } from "@/db";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";

type AnyObj = Record<string, unknown>;

const EXECUTOR = {} as DbExecutor;

const repo = {
  byCode: undefined as AnyObj | undefined,
  byIds: [] as AnyObj[],
};

// mock.module is process-wide: spread the real repository, or every other test
// file that loads it loses its remaining exports.
const actualRepo = await import("@/modules/campaigns/campaign.repository");

mock.module("@/modules/campaigns/campaign.repository", () => ({
  ...actualRepo,
  findCampaignByCode: () => Promise.resolve(repo.byCode),
  findCampaignsByIdsWithEligibility: () => Promise.resolve(repo.byIds),
}));

const { resolveVoucherCode, getUsableCampaigns } = await import(
  "@/modules/campaigns/campaign.service"
);

const makeVoucherCampaign = (over: AnyObj = {}) => ({
  id: 7,
  code: "VIP",
  name: "VIP Launch",
  redemption_mode: "code",
  is_active: true,
  starts_at: null as Date | null,
  ends_at: null as Date | null,
  min_order_total: "0",
  discount_type: "fixed",
  discount_value: "60000",
  max_discount: null,
  buy_quantity: null,
  free_quantity: null,
  stores: [] as { store_id: number }[],
  eligibleServices: [] as { service_id: number }[],
  ...over,
});

const ctx = { storeId: 1, storeCode: "JKT", grossTotal: 100_000, lines: [] };

beforeEach(() => {
  repo.byCode = undefined;
  repo.byIds = [];
});

describe("resolveVoucherCode", () => {
  it("rejects a code that does not exist", async () => {
    repo.byCode = undefined;
    const error = await captureRejection(
      resolveVoucherCode(EXECUTOR, "NOPE1234", ctx)
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Voucher code not found: NOPE1234");
  });

  it("rejects a code that has already been redeemed", async () => {
    repo.byCode = {
      redeemed_at: new Date("2026-06-01T00:00:00Z"),
      campaign: makeVoucherCampaign(),
    };
    const error = await captureRejection(
      resolveVoucherCode(EXECUTOR, "VIP12345", ctx)
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Voucher code VIP12345 has already been redeemed"
    );
  });

  it("rejects a code whose campaign is not in code mode", async () => {
    repo.byCode = {
      redeemed_at: null,
      campaign: makeVoucherCampaign({ redemption_mode: "listed" }),
    };
    const error = await captureRejection(
      resolveVoucherCode(EXECUTOR, "VIP12345", ctx)
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Code VIP12345 does not belong to a voucher campaign"
    );
  });

  it("rejects an unredeemed code on an ineligible (inactive) campaign", async () => {
    repo.byCode = {
      redeemed_at: null,
      campaign: makeVoucherCampaign({ is_active: false }),
    };
    const error = await captureRejection(
      resolveVoucherCode(EXECUTOR, "VIP12345", ctx)
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Campaign VIP is not active");
  });

  it("resolves an unredeemed, eligible code and returns it beside the campaign", async () => {
    repo.byCode = { redeemed_at: null, campaign: makeVoucherCampaign() };
    const { campaign, voucherCode } = await resolveVoucherCode(
      EXECUTOR,
      "VIP12345",
      ctx
    );
    expect(voucherCode).toBe("VIP12345");
    expect(campaign.id).toBe(7);
    expect(campaign.is_expired).toBe(false);
  });

  it("rejects a buy 4 get 1 code typed with only three eligible Services", async () => {
    // Accepted here, it showed as applied at Rp 0 and payment refused it later.
    repo.byCode = {
      redeemed_at: null,
      campaign: makeVoucherCampaign({
        discount_type: "buy_n_get_m_free",
        buy_quantity: 4,
        free_quantity: 1,
        eligibleServices: [{ service_id: 5 }],
      }),
    };
    const error = await captureRejection(
      resolveVoucherCode(EXECUTOR, "VIP12345", {
        ...ctx,
        lines: [{ service_id: 5 }, { service_id: 5 }, { service_id: 5 }],
      })
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Campaign VIP needs 5 eligible Services"
    );
  });
});

const makeListedRow = (over: AnyObj = {}) => ({
  id: 1,
  code: "SAVE10",
  redemption_mode: "listed",
  is_active: true,
  starts_at: null as Date | null,
  ends_at: null as Date | null,
  min_order_total: "0",
  stores: [] as { store_id: number }[],
  eligibleServices: [] as { service_id: number }[],
  ...over,
});

describe("getUsableCampaigns", () => {
  const call = (campaignIds: number[]) =>
    getUsableCampaigns(EXECUTOR, {
      campaignIds,
      grossTotal: 100_000,
      lines: [],
      storeId: 1,
      storeCode: "JKT",
    });

  it("rejects when a requested campaign id is missing", async () => {
    repo.byIds = [makeListedRow({ id: 1 })];
    const error = await captureRejection(call([1, 2]));
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe("Campaign not found: 2");
  });

  it("rejects a voucher (code-mode) campaign sent via campaign_ids", async () => {
    repo.byIds = [makeListedRow({ id: 9, redemption_mode: "code" })];
    const error = await captureRejection(call([9]));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Campaign 9 is a voucher — submit via voucher_codes, not campaign_ids"
    );
  });

  it("checks the missing id before the wrong-mode rule", async () => {
    repo.byIds = [makeListedRow({ id: 9, redemption_mode: "code" })];
    const error = await captureRejection(call([9, 42]));
    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("returns listed campaigns flattened to eligible_service_ids", async () => {
    repo.byIds = [
      makeListedRow({
        id: 1,
        eligibleServices: [{ service_id: 5 }, { service_id: 6 }],
      }),
    ];
    const result = await call([1]);
    expect(result).toHaveLength(1);
    expect(result[0].eligible_service_ids).toEqual([5, 6]);
    expect(result[0]).not.toHaveProperty("stores");
    expect(result[0]).not.toHaveProperty("eligibleServices");
  });

  it("refuses a buy 4 get 1 ticked on an Order with only three eligible Services", async () => {
    // The POS tile was ticked at five Items and two were removed before
    // checkout; the stale tick must not reach the Receipt.
    repo.byIds = [
      makeListedRow({
        id: 3,
        code: "B4G1",
        discount_type: "buy_n_get_m_free",
        buy_quantity: 4,
        free_quantity: 1,
        eligibleServices: [{ service_id: 5 }],
      }),
    ];
    const error = await captureRejection(
      getUsableCampaigns(EXECUTOR, {
        campaignIds: [3],
        grossTotal: 100_000,
        lines: [{ service_id: 5 }, { service_id: 5 }, { service_id: 5 }],
        storeId: 1,
        storeCode: "JKT",
      })
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Campaign B4G1 needs 5 eligible Services"
    );
  });
});
