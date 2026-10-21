import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { DbExecutor } from "@/db";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";

const EXECUTOR = {} as DbExecutor;

// A listed Campaign row bumps its usage count; a Voucher row spends one Voucher
// code. Mixing them up claims the wrong thing at checkout.

interface FakeListedCampaign {
  buy_quantity: null;
  discount_type: "fixed";
  discount_value: string;
  eligible_service_ids: number[];
  free_quantity: null;
  id: number;
  max_discount: null;
  min_order_total: string;
}

interface FakeVoucherCampaign
  extends Omit<FakeListedCampaign, "eligible_service_ids"> {
  eligibleServices: { service_id: number }[];
}

const catalog: {
  listed: Record<number, FakeListedCampaign>;
  vouchers: Record<string, FakeVoucherCampaign>;
} = { listed: {}, vouchers: {} };

mock.module("@/modules/campaigns/campaign.service", () => ({
  getUsableCampaigns: (
    _executor: unknown,
    { campaignIds }: { campaignIds: number[] }
  ) => Promise.resolve(campaignIds.map((id) => catalog.listed[id])),
  // The real lookup returns the code beside the Campaign, never on it.
  resolveVoucherCode: (_executor: unknown, code: string) =>
    Promise.resolve({ campaign: catalog.vouchers[code], voucherCode: code }),
}));

const { resolveDiscount } = await import(
  "@/modules/orders/order-discount.service"
);

const makeListed = (id: number, discountValue: string): FakeListedCampaign => ({
  buy_quantity: null,
  discount_type: "fixed",
  discount_value: discountValue,
  eligible_service_ids: [],
  free_quantity: null,
  id,
  max_discount: null,
  min_order_total: "0",
});

const makeVoucher = (
  id: number,
  discountValue: string
): FakeVoucherCampaign => ({
  buy_quantity: null,
  discount_type: "fixed",
  discount_value: discountValue,
  eligibleServices: [],
  free_quantity: null,
  id,
  max_discount: null,
  min_order_total: "0",
});

const checkout = ({
  campaignIds = [],
  voucherCodes = [],
  grossTotal,
  manualDiscount = 0,
}: {
  campaignIds?: number[];
  voucherCodes?: string[];
  grossTotal: number;
  manualDiscount?: number;
}) =>
  resolveDiscount(EXECUTOR, {
    campaignIds,
    voucherCodes,
    grossTotal,
    manualDiscount,
    storeId: 1,
    storeCode: "JKT",
    lines: [],
  });

const rowFor = (
  rows: Awaited<ReturnType<typeof checkout>>["campaignRows"],
  campaignId: number
) => rows.find((row) => row.campaign_id === campaignId);

beforeEach(() => {
  catalog.listed = {};
  catalog.vouchers = {};
});

describe("resolveDiscount", () => {
  it("marks a running store promo as listed so it bumps a counter, not a code", async () => {
    // The cashier ticks a listed Campaign; there is no Voucher code to spend.
    catalog.listed[1] = makeListed(1, "10000");

    const { campaignRows, discountAmount, discountSource } = await checkout({
      campaignIds: [1],
      grossTotal: 100_000,
    });

    expect(discountAmount).toBe(10_000);
    expect(discountSource).toBe("campaign");
    expect(campaignRows).toHaveLength(1);
    expect(campaignRows[0]).toMatchObject({
      applied_amount: "10000",
      campaign_id: 1,
      kind: "listed",
    });
    // No voucherCode at all, so the claim cannot mistake it for a code to spend.
    expect(campaignRows[0]).not.toHaveProperty("voucherCode");
  });

  it("carries the exact code from a customer's voucher slip", async () => {
    // The cashier types the Customer's VIP12345; that one code gets spent.
    catalog.vouchers.VIP12345 = makeVoucher(7, "15000");

    const { campaignRows } = await checkout({
      voucherCodes: ["VIP12345"],
      grossTotal: 100_000,
    });

    expect(campaignRows).toHaveLength(1);
    expect(campaignRows[0]).toMatchObject({
      applied_amount: "15000",
      campaign_id: 7,
      kind: "voucher",
      voucherCode: "VIP12345",
    });
  });

  it("keeps each slip's code on its own campaign when several are used at once", async () => {
    // A family brings two Voucher codes plus a listed Campaign; crossed codes
    // would spend the wrong one.
    catalog.listed[1] = makeListed(1, "10000");
    catalog.vouchers.AAAA1111 = makeVoucher(20, "20000");
    catalog.vouchers.BBBB2222 = makeVoucher(30, "30000");

    const { campaignRows, discountAmount } = await checkout({
      campaignIds: [1],
      voucherCodes: ["AAAA1111", "BBBB2222"],
      grossTotal: 100_000,
    });

    expect(discountAmount).toBe(60_000);
    expect(campaignRows).toHaveLength(3);
    expect(rowFor(campaignRows, 20)).toMatchObject({
      kind: "voucher",
      voucherCode: "AAAA1111",
    });
    expect(rowFor(campaignRows, 30)).toMatchObject({
      kind: "voucher",
      voucherCode: "BBBB2222",
    });
    expect(rowFor(campaignRows, 1)).toMatchObject({ kind: "listed" });
  });

  it("does not spend a slip that ends up discounting nothing", async () => {
    // The listed Campaign already zeroes this Order, so the Voucher code stays
    // unspent for the Customer's next visit.
    catalog.listed[1] = makeListed(1, "20000");
    catalog.vouchers.SAVE9999 = makeVoucher(40, "5000");

    const { campaignRows, discountAmount } = await checkout({
      campaignIds: [1],
      voucherCodes: ["SAVE9999"],
      grossTotal: 20_000,
    });

    expect(discountAmount).toBe(20_000);
    expect(campaignRows).toHaveLength(1);
    expect(campaignRows[0]).toMatchObject({ campaign_id: 1, kind: "listed" });
    expect(rowFor(campaignRows, 40)).toBeUndefined();
  });

  it("rejects the same campaign arriving twice before anything is claimed", async () => {
    // Two codes from one Voucher would collide on order_campaigns' unique key
    // mid-checkout; refusing them also keeps each code's Campaign unambiguous.
    catalog.vouchers.AAAA1111 = makeVoucher(20, "20000");
    catalog.vouchers.BBBB2222 = makeVoucher(20, "20000");

    const error = await captureRejection(
      checkout({
        voucherCodes: ["AAAA1111", "BBBB2222"],
        grossTotal: 100_000,
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "A campaign can only be applied once per order"
    );
  });

  it("books a manual discount without producing any campaign row", async () => {
    const { campaignRows, discountAmount, discountSource } = await checkout({
      grossTotal: 100_000,
      manualDiscount: 25_000,
    });

    expect(discountAmount).toBe(25_000);
    expect(discountSource).toBe("manual");
    expect(campaignRows).toEqual([]);
  });

  it("caps a hand-keyed discount at the order total instead of rejecting it", async () => {
    // Staff type 200k off a 150k deep clean: the Order goes free, not negative,
    // matching what the POS showed (ADR-0018).
    const { discountAmount, discountSource } = await checkout({
      grossTotal: 150_000,
      manualDiscount: 200_000,
    });

    expect(discountAmount).toBe(150_000);
    expect(discountSource).toBe("manual");
  });
});
