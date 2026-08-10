import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";

// resolveDiscount is the checkout counter's discount desk: the cashier has ticked
// some running store promos, the customer may have handed over one or more printed
// voucher slips, and this is where both become the rows that claim a redemption.
// Getting a row's kind wrong misroutes a claim — a listed row bumps a usage
// counter, a voucher row spends one specific bearer code — so these tests pin the
// listed/voucher decision and which code lands on which campaign.
//
// Only the two campaign lookups are doubled. The stacking arithmetic
// (stackCampaignDiscounts) stays real, so the discount amounts here are the ones
// a live checkout would compute.

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
  getUsableCampaigns: ({ campaignIds }: { campaignIds: number[] }) =>
    Promise.resolve(campaignIds.map((id) => catalog.listed[id])),
  // Mirrors the real signature after the pair refactor: the code comes back
  // beside the campaign, never on it.
  resolveVoucherCode: (code: string) =>
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
  resolveDiscount({
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
    // Cashier ticks "Rp10.000 off" — a promo the shop advertises to everyone.
    // Nobody handed over a slip, so there is no single-use code to spend.
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
    // The decisive bit: no voucherCode field at all, so claimRedemptions cannot
    // mistake this for a bearer code it needs to burn.
    expect(campaignRows[0]).not.toHaveProperty("voucherCode");
  });

  it("carries the exact code from a customer's voucher slip", async () => {
    // Customer hands over a printed slip; the cashier types VIP12345. That one
    // code — not the campaign in general — is what must be marked redeemed.
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
    // A family drops off laundry with two different voucher slips plus the shop's
    // running promo. If the codes crossed wires here, one customer's slip would be
    // spent against the other's campaign and the wrong code marked redeemed.
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
    // The store promo alone already zeroes this small order, so the customer's
    // slip buys them nothing. It must come back unspent and still be usable on a
    // future visit — burning a single-use code for Rp0 is money out of the
    // customer's pocket.
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
    // Two slips minted from one campaign, or a slip for a campaign the cashier also
    // ticked. order_campaigns is unique on (order_id, campaign_id), so letting both
    // through would collide mid-checkout and clobber the claimed code_id. This
    // rejection is also what makes the code-to-campaign lookup unambiguous.
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
    // Supervisor keys in a goodwill discount by hand. No campaign was involved, so
    // nothing should be logged as redeemed against one.
    const { campaignRows, discountAmount, discountSource } = await checkout({
      grossTotal: 100_000,
      manualDiscount: 25_000,
    });

    expect(discountAmount).toBe(25_000);
    expect(discountSource).toBe("manual");
    expect(campaignRows).toEqual([]);
  });

  it("caps a hand-keyed discount at the order total instead of rejecting it", async () => {
    // The supervisor comps a 150k deep clean by typing 200k off. The order
    // goes free, not negative — the discount clamps to the 150k that exists,
    // matching what the POS showed on screen (ADR-0018: every number is
    // final at payment, so the total IS the cap).
    const { discountAmount, discountSource } = await checkout({
      grossTotal: 150_000,
      manualDiscount: 200_000,
    });

    expect(discountAmount).toBe(150_000);
    expect(discountSource).toBe("manual");
  });
});
