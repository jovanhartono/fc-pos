import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestException, ForbiddenException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// updateOrderPayment is the pickup desk's cash moment: the customer collects
// their items and the cashier taps "collect". Whatever lands in paid_amount
// IS the recorded revenue for this order, and — since ADR-0018 moved the
// discount desk here — this is also where promos and voucher slips are
// settled and every line price freezes. These tests pin the net-due
// arithmetic, the no-price-no-payment gate, and that the discount desk runs
// exactly once, inside the payment transaction.
//
// "@/db", the discount desk, and the redemption claims are doubled; their own
// contracts are pinned elsewhere. assertCanProcessPayment stays real — its
// role matrix is pinned in permissions.test.ts.

type AnyObj = Record<string, unknown>;

interface FakeOrderRow {
  discount: string | null;
  discount_source: string;
  id: number;
  payment_status: string;
  refunded_amount: string | null;
  status: string;
  store: { code: string };
  store_id: number;
  total: string | null;
}

interface FakeServiceLine {
  price: string | null;
  service: { price: string | null } | null;
  service_id: number;
  status: string;
}

const dbState = {
  order: undefined as FakeOrderRow | undefined,
  serviceLines: [] as FakeServiceLine[],
  findFirstCalls: [] as unknown[],
  setPayload: undefined as Record<string, unknown> | undefined,
  updateCalls: 0,
  // Simulates losing the collect race: another cashier paid the order
  // between the read and the write.
  casWins: true as boolean,
};

const TX = {
  update: () => ({
    set: (payload: Record<string, unknown>) => {
      dbState.updateCalls += 1;
      dbState.setPayload = payload;
      return {
        where: () => ({
          returning: () =>
            Promise.resolve(
              dbState.casWins
                ? [
                    {
                      id: dbState.order?.id,
                      payment_status: payload.payment_status,
                      paid_amount: payload.paid_amount,
                    },
                  ]
                : []
            ),
        }),
      };
    },
  }),
};

mock.module("@/db", () => ({
  db: {
    query: {
      ordersTable: {
        findFirst: (args: unknown) => {
          dbState.findFirstCalls.push(args);
          return Promise.resolve(dbState.order);
        },
      },
      ordersServicesTable: {
        findMany: () => Promise.resolve(dbState.serviceLines),
      },
    },
    transaction: (cb: (tx: unknown) => unknown) => cb(TX),
  },
}));

const discount = {
  calls: [] as AnyObj[],
  result: {
    campaignRows: [] as AnyObj[],
    discountAmount: 0,
    discountSource: "none",
  },
};

const redemptions = {
  calls: [] as { tx: unknown; rows: unknown; orderId: number }[],
};

const actualDiscountService = {
  ...(await import("@/modules/orders/order-discount.service")),
};
const actualRedemptionService = {
  ...(await import("@/modules/campaigns/campaign-redemption.service")),
};

mock.module("@/modules/orders/order-discount.service", () => ({
  ...actualDiscountService,
  resolveDiscount: (input: AnyObj) => {
    discount.calls.push(input);
    return Promise.resolve(discount.result);
  },
}));

mock.module("@/modules/campaigns/campaign-redemption.service", () => ({
  ...actualRedemptionService,
  claimRedemptions: (tx: unknown, rows: unknown, orderId: number) => {
    redemptions.calls.push({ tx, rows, orderId });
    return Promise.resolve();
  },
}));

const { updateOrderPayment } = await import(
  "@/modules/orders/order-payment.service"
);

afterAll(() => {
  mock.module(
    "@/modules/orders/order-discount.service",
    () => actualDiscountService
  );
  mock.module(
    "@/modules/campaigns/campaign-redemption.service",
    () => actualRedemptionService
  );
});

const CASHIER = { id: 42, role: "cashier" } as unknown as JWTPayload;

const makeOrder = (over: Partial<FakeOrderRow> = {}): FakeOrderRow => ({
  discount: "0",
  discount_source: "none",
  id: 10,
  payment_status: "unpaid",
  refunded_amount: "0",
  status: "ready_for_pickup",
  store: { code: "JKT" },
  store_id: 1,
  total: "100000",
  ...over,
});

const collect = (body: AnyObj = {}, user: JWTPayload = CASHIER) =>
  updateOrderPayment({
    orderId: 10,
    body: {
      payment_method_id: 3,
      campaign_ids: [],
      voucher_codes: [],
      discount: 0,
      ...body,
    } as never,
    user,
  });

beforeEach(() => {
  dbState.order = makeOrder();
  dbState.serviceLines = [];
  dbState.findFirstCalls = [];
  dbState.setPayload = undefined;
  dbState.updateCalls = 0;
  dbState.casWins = true;
  discount.calls = [];
  discount.result = {
    campaignRows: [],
    discountAmount: 0,
    discountSource: "none",
  };
  redemptions.calls = [];
});

describe("updateOrderPayment", () => {
  it("settles the discount at the counter and collects the net", async () => {
    // Rp100.000 of work; the cashier keys the Rp10.000 the supervisor
    // approved. The customer hands over Rp90.000 and that exact figure
    // becomes the order's recorded revenue, tagged with the cashier and
    // payment method for the shift report — and the discount is persisted
    // here, because the unpaid order carried none (ADR-0018).
    discount.result = {
      campaignRows: [],
      discountAmount: 10_000,
      discountSource: "manual",
    };

    const result = await collect({ discount: 10_000 });

    expect(result).toEqual({
      id: 10,
      payment_status: "paid",
      paid_amount: "90000",
    });
    expect(discount.calls[0]).toMatchObject({
      grossTotal: 100_000,
      manualDiscount: 10_000,
      storeId: 1,
      storeCode: "JKT",
    });
    expect(dbState.setPayload).toMatchObject({
      discount: "10000",
      discount_source: "manual",
      paid_amount: "90000",
      paid_by: 42,
      payment_method_id: 3,
      payment_status: "paid",
      updated_by: 42,
    });
    expect(dbState.setPayload?.paid_at).toBeInstanceOf(Date);
  });

  it("claims the voucher only now, inside the payment transaction", async () => {
    // A repair kept this order unpriced at drop-off, so the slip could not be
    // keyed then (ADR-0018) — the customer held it until the workshop agreed a
    // number. It is claimed in the same transaction that books the money, so a
    // failed payment leaves the code spendable.
    discount.result = {
      campaignRows: [
        { campaign_id: 5, kind: "voucher", voucherCode: "VIP12345" },
      ],
      discountAmount: 20_000,
      discountSource: "campaign",
    };

    await collect({ voucher_codes: ["VIP12345"] });

    expect(discount.calls[0]).toMatchObject({
      voucherCodes: ["VIP12345"],
    });
    expect(redemptions.calls).toEqual([
      { tx: TX, rows: discount.result.campaignRows, orderId: 10 },
    ]);
    expect(dbState.setPayload?.paid_amount).toBe("80000");
  });

  it("collects the printed total without claiming a promo twice", async () => {
    // The driver dropped fully priced items off and the promo settled then: its
    // code is already out of circulation and its amount is printed on the
    // receipt the customer is holding. At pickup the desk only books the money.
    // Re-running the discount desk here would spend the voucher a second time
    // and could quietly hand back a different number than the printed one.
    dbState.order = makeOrder({
      discount: "30000",
      discount_source: "campaign",
    });

    const result = await collect();

    expect(discount.calls).toHaveLength(0);
    expect(redemptions.calls[0].rows).toEqual([]);
    expect(result?.paid_amount).toBe("70000");
    expect(dbState.setPayload).toMatchObject({
      discount: "30000",
      discount_source: "campaign",
    });
  });

  it("refuses a second promo at the desk when one already printed", async () => {
    // A cashier keying the campaign again at pickup — the customer produces the
    // receipt, the cashier assumes nothing was applied. Stacking a second claim
    // on top would double the discount and burn another code, so the desk says
    // plainly that the number on the receipt is what to collect.
    dbState.order = makeOrder({
      discount: "30000",
      discount_source: "campaign",
    });

    const error = await captureRejection(collect({ campaign_ids: [5] }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "This order's discount was settled at drop-off — collect the printed total"
    );
    expect(discount.calls).toHaveLength(0);
    expect(redemptions.calls).toHaveLength(0);
  });

  it("runs the campaign base on the full total but keeps repair lines out of the BOGO slots", async () => {
    // Deep clean 150k + repair agreed at 200k. The owner wants repair spend
    // to count toward promotions (ADR-0018), so the base is the whole 350k —
    // but the repair line must never be selectable as a buy-one-get-one free
    // item, so only the catalog-priced line reaches the discount desk's list.
    dbState.order = makeOrder({ total: "350000" });
    dbState.serviceLines = [
      {
        price: "150000",
        service: { price: "150000" },
        service_id: 21,
        status: "queued",
      },
      {
        price: "200000",
        service: { price: null },
        service_id: 30,
        status: "queued",
      },
    ];

    await collect({ campaign_ids: [7] });

    expect(discount.calls[0]).toMatchObject({
      campaignIds: [7],
      grossTotal: 350_000,
    });
    expect(discount.calls[0]?.lines).toEqual([
      { price: 150_000, service_id: 21 },
    ]);
  });

  it("refuses to collect while any live line is unpriced", async () => {
    // Deep clean 150k plus a bag repair nobody has priced yet. Until the
    // workshop opens the bag and a number is agreed, the shop takes no money
    // — not even the 150k it already knows (ADR-0018, ADR-0001).
    dbState.serviceLines = [
      {
        price: "150000",
        service: { price: "150000" },
        service_id: 21,
        status: "queued",
      },
      {
        price: null,
        service: { price: null },
        service_id: 30,
        status: "queued",
      },
    ];

    const error = await captureRejection(collect());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has an unpriced line — set its price before collecting payment"
    );
    expect(dbState.updateCalls).toBe(0);
    expect(discount.calls).toHaveLength(0);
  });

  it("collects normally once the blank line has been priced", async () => {
    // The workshop settled the repair at 250k over WhatsApp and keyed it in.
    // A priced repair line is a final number like any other.
    dbState.serviceLines = [
      {
        price: "250000",
        service: { price: null },
        service_id: 30,
        status: "processing",
      },
    ];

    await collect();

    expect(dbState.setPayload?.payment_status).toBe("paid");
  });

  it("ignores a cancelled unpriced line when gating payment", async () => {
    // The customer dropped the repair after hearing the number; the line was
    // cancelled (unpaid off-ramp, ADR-0008). Its blank price is out of the
    // money, so the deep clean that stayed must still be collectable.
    dbState.serviceLines = [
      {
        price: null,
        service: { price: null },
        service_id: 30,
        status: "cancelled",
      },
      {
        price: "150000",
        service: { price: "150000" },
        service_id: 21,
        status: "queued",
      },
    ];

    await collect();

    expect(dbState.setPayload?.payment_status).toBe("paid");
  });

  it("deducts an earlier refund so the customer is not charged for a ruined item", async () => {
    // A shirt was ruined and Rp25.000 already went back before pickup.
    // Collecting the full Rp100.000 now would make the customer pay for the
    // very line the shop refunded.
    dbState.order = makeOrder({ total: "100000", refunded_amount: "25000" });

    await collect();

    expect(dbState.setPayload?.paid_amount).toBe("75000");
  });

  it("clamps at zero when refunds already exceed what is left to pay", async () => {
    // Rp50.000 order, a Rp10.000 promo settled now, Rp60.000 refunded after
    // a whole bag went missing. Nothing is owed — a negative paid_amount
    // would poison the revenue report with money the till never saw.
    dbState.order = makeOrder({ total: "50000", refunded_amount: "60000" });
    discount.result = {
      campaignRows: [],
      discountAmount: 10_000,
      discountSource: "manual",
    };

    await collect({ discount: 10_000 });

    expect(dbState.setPayload?.paid_amount).toBe("0");
  });

  it("rejects a second collect so the same order is never charged twice", async () => {
    // Cashier taps collect twice on a laggy screen. The second tap must
    // bounce instead of overwriting paid_at/paid_by and double-counting
    // revenue.
    dbState.order = makeOrder({ payment_status: "paid" });

    const error = await captureRejection(collect());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Order has already been paid");
    expect(dbState.updateCalls).toBe(0);
  });

  it("loses the collect race cleanly when another till paid first", async () => {
    // Two cashiers collect the same order from two tills. The loser's write
    // finds payment_status already flipped; the thrown error rolls its
    // transaction back, voucher claims included.
    dbState.casWins = false;

    const error = await captureRejection(collect());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Order has already been paid");
  });

  it("rejects collecting on a cancelled order", async () => {
    // The order was cancelled before pickup — taking money for it would book
    // revenue against work the shop never did.
    dbState.order = makeOrder({ status: "cancelled" });

    const error = await captureRejection(collect());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Cannot collect payment on a cancelled order"
    );
    expect(dbState.updateCalls).toBe(0);
  });

  it("returns null for an unknown order so the route can 404", async () => {
    // Stale tab pointing at a deleted order: no throw, no write — the route
    // turns null into a 404.
    dbState.order = undefined;

    const result = await collect();

    expect(result).toBeNull();
    expect(dbState.updateCalls).toBe(0);
  });

  it("books zero, not NaN, for a legacy row missing its total", async () => {
    // Old rows imported before totals were mandatory carry total = null.
    // paid_amount "NaN" would break every sum in the revenue report.
    dbState.order = makeOrder({ total: null });

    await collect();

    expect(dbState.setPayload?.paid_amount).toBe("0");
  });

  it("blocks a courier before the order is even looked up", async () => {
    // A courier only clocks in (ADR-0010); they never handle money. Their
    // attempt dies at the permission gate — the database is never touched.
    const courier = { id: 7, role: "courier" } as unknown as JWTPayload;

    const error = await captureRejection(collect({}, courier));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(dbState.findFirstCalls).toHaveLength(0);
    expect(dbState.updateCalls).toBe(0);
  });
});
