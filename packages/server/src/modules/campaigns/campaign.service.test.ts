import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestException, NotFoundException } from "@/errors";

// The service takes no DB handle: it calls repository functions directly. A pair
// of in-memory doubles drives resolveVoucherCode (findCampaignByCode) and
// getUsableCampaigns (findCampaignsByIdsWithEligibility) through every branch
// without touching a database. Tests mutate `repo` to shape each response.
type AnyObj = Record<string, unknown>;

const repo = {
  byCode: undefined as AnyObj | undefined,
  byIds: [] as AnyObj[],
};

// bun's mock.module is process-global, so spread the real repository and
// override only the two reads under test — otherwise the partial mock strips
// the module's other exports for every test file that loads it.
const actualRepo = await import("@/modules/campaigns/campaign.repository");

mock.module("@/modules/campaigns/campaign.repository", () => ({
  ...actualRepo,
  findCampaignByCode: () => Promise.resolve(repo.byCode),
  findCampaignsByIdsWithEligibility: () => Promise.resolve(repo.byIds),
}));

const { resolveVoucherCode, getUsableCampaigns } = await import(
  "@/modules/campaigns/campaign.service"
);

const captureRejection = async (
  promise: Promise<unknown>
): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject, but it resolved");
};

// A code-mode campaign shaped like the nested findCampaignByCode row's
// `campaign` (stores/eligibleServices nested, discount columns present).
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

const ctx = { storeId: 1, storeCode: "JKT", grossTotal: 100_000 };

beforeEach(() => {
  repo.byCode = undefined;
  repo.byIds = [];
});

describe("resolveVoucherCode", () => {
  it("rejects a code that does not exist", async () => {
    repo.byCode = undefined;
    const error = await captureRejection(resolveVoucherCode("NOPE1234", ctx));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Voucher code not found: NOPE1234");
  });

  it("rejects a code that has already been redeemed", async () => {
    repo.byCode = {
      redeemed_at: new Date("2026-06-01T00:00:00Z"),
      campaign: makeVoucherCampaign(),
    };
    const error = await captureRejection(resolveVoucherCode("VIP12345", ctx));
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
    const error = await captureRejection(resolveVoucherCode("VIP12345", ctx));
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
    const error = await captureRejection(resolveVoucherCode("VIP12345", ctx));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Campaign VIP is not active");
  });

  it("resolves an unredeemed, eligible code and tags it with _voucherCode", async () => {
    repo.byCode = { redeemed_at: null, campaign: makeVoucherCampaign() };
    const resolved = await resolveVoucherCode("VIP12345", ctx);
    expect(resolved._voucherCode).toBe("VIP12345");
    expect(resolved.id).toBe(7);
    expect(resolved.is_expired).toBe(false);
  });
});

// findCampaignsByIdsWithEligibility rows carry stores + eligibleServices.
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
    getUsableCampaigns({
      campaignIds,
      grossTotal: 100_000,
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
    // A code-mode row present, but another id missing: not-found must win.
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
});
