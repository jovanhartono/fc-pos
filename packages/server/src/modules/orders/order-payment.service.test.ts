import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestException, ForbiddenException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// The cashier collects payment at pickup: paid_amount is what the shop
// collected, and an unpaid Order's discounts settle here (ADR-0018).

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
  complaint_id: null;
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
  // false = another cashier paid the Order between the read and the write.
  casWins: true as boolean,
};

// Every read runs in the transaction, so a price keyed mid-payment cannot
// slip past the checks.
const TX = {
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

// The order repository prepares statements on import, so the fake needs this
// even though nothing here reads an Item.
mock.module("@/db", () => ({
  db: {
    query: {
      itemsTable: {
        findFirst: () => ({
          prepare: () => ({ execute: () => Promise.resolve(undefined) }),
        }),
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
  resolveDiscount: (_executor: unknown, input: AnyObj) => {
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
    // Rp100.000 of work, Rp10.000 off keyed at pickup: Rp90.000 is collected,
    // and the discount is saved now since the unpaid Order had none (ADR-0018).
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
    // An unpriced Repair held the Voucher code back at drop-off (ADR-0018); a
    // failed payment must leave the code spendable.
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
    // The discount settled at drop-off and is printed on the Receipt; settling
    // again would spend the Voucher code twice or change the printed total.
    dbState.order = makeOrder({
      discount: "30000",
      discount_source: "campaign",
    });

    const result = await collect();

    expect(discount.calls).toHaveLength(0);
    expect(redemptions.calls).toHaveLength(0);
    expect(result?.paid_amount).toBe("70000");
    expect(dbState.setPayload).toMatchObject({
      discount: "30000",
      discount_source: "campaign",
    });
  });

  it("refuses a second promo at the desk when one already printed", async () => {
    // A cashier re-applies the Campaign at pickup; stacking it would double the
    // discount, so they are told to collect the printed total.
    dbState.order = makeOrder({
      discount: "30000",
      discount_source: "campaign",
    });

    const error = await captureRejection(collect({ campaign_ids: [5] }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "This Order's discount was settled at drop-off. Collect the printed total."
    );
    expect(discount.calls).toHaveLength(0);
    expect(redemptions.calls).toHaveLength(0);
  });

  it("runs the campaign base on the full total but keeps repair lines out of the BOGO slots", async () => {
    // Repair spend counts toward the minimum (ADR-0018), but a Repair is never
    // the free Item in a buy-one-get-one.
    dbState.order = makeOrder({ total: "350000" });
    dbState.serviceLines = [
      {
        complaint_id: null,
        price: "150000",
        service: { price: "150000" },
        service_id: 21,
        status: "queued",
      },
      {
        complaint_id: null,
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
    // Deep clean plus an unpriced Repair: no money until the price is agreed,
    // not even the known 150k (ADR-0018, ADR-0001).
    dbState.serviceLines = [
      {
        complaint_id: null,
        price: "150000",
        service: { price: "150000" },
        service_id: 21,
        status: "queued",
      },
      {
        complaint_id: null,
        price: null,
        service: { price: null },
        service_id: 30,
        status: "queued",
      },
    ];

    const error = await captureRejection(collect());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has an unpriced line. Price it before collecting payment."
    );
    expect(dbState.updateCalls).toBe(0);
    expect(discount.calls).toHaveLength(0);
  });

  it("collects normally once the blank line has been priced", async () => {
    dbState.serviceLines = [
      {
        complaint_id: null,
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
    // The Customer declined the Repair's quote and it was cancelled (ADR-0008);
    // the deep clean must still be collectable.
    dbState.serviceLines = [
      {
        complaint_id: null,
        price: null,
        service: { price: null },
        service_id: 30,
        status: "cancelled",
      },
      {
        complaint_id: null,
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
    // Rp25.000 was refunded before pickup; charging the full Rp100.000 would
    // bill the Customer for the refunded Line.
    dbState.order = makeOrder({ total: "100000", refunded_amount: "25000" });

    await collect();

    expect(dbState.setPayload?.paid_amount).toBe("75000");
  });

  it("clamps at zero when refunds already exceed what is left to pay", async () => {
    // Refunds already exceed what is left: a negative paid_amount would put
    // money nobody took into the Revenue report.
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
    // A double tap on a laggy screen must not count the money twice.
    dbState.order = makeOrder({ payment_status: "paid" });

    const error = await captureRejection(collect());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Order has already been paid");
    expect(dbState.updateCalls).toBe(0);
  });

  it("loses the collect race cleanly when another POS paid first", async () => {
    // Two cashiers collect the same Order at once; the loser's transaction
    // rolls back, Voucher claims included.
    dbState.casWins = false;

    const error = await captureRejection(collect());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Order has already been paid");
  });

  it("rejects collecting on a cancelled order", async () => {
    dbState.order = makeOrder({ status: "cancelled" });

    const error = await captureRejection(collect());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Cannot collect payment on a cancelled order"
    );
    expect(dbState.updateCalls).toBe(0);
  });

  it("returns null for an unknown order so the route can 404", async () => {
    dbState.order = undefined;

    const result = await collect();

    expect(result).toBeNull();
    expect(dbState.updateCalls).toBe(0);
  });

  it("books zero, not NaN, for a legacy row missing its total", async () => {
    // Imported rows can have no total; "NaN" would break every report sum.
    dbState.order = makeOrder({ total: null });

    await collect();

    expect(dbState.setPayload?.paid_amount).toBe("0");
  });

  it("blocks a courier before the order is even looked up", async () => {
    // A Courier only clocks in and never handles money (ADR-0010).
    const courier = { id: 7, role: "courier" } as unknown as JWTPayload;

    const error = await captureRejection(collect({}, courier));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(dbState.findFirstCalls).toHaveLength(0);
    expect(dbState.updateCalls).toBe(0);
  });
});
