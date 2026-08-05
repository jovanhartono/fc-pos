import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestException, ForbiddenException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// updateOrderPayment is the pickup desk's cash moment: the customer collects
// their laundry and the cashier taps "collect". Whatever lands in paid_amount
// IS the recorded revenue for this order, so these tests pin the net-due
// arithmetic (total minus discount minus already-refunded, never below zero)
// and the gates that stop a garment leaving unpaid or being charged twice.
//
// Only "@/db" is doubled. assertCanProcessPayment stays real — its role matrix
// is pinned in permissions.test.ts; here we only pin that the gate fires
// before any database read.

interface FakeOrderRow {
  discount: string | null;
  id: number;
  payment_status: string;
  refunded_amount: string | null;
  status: string;
  total: string | null;
}

const dbState = {
  order: undefined as FakeOrderRow | undefined,
  findFirstCalls: [] as unknown[],
  setPayload: undefined as Record<string, unknown> | undefined,
  updateCalls: 0,
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
    },
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        dbState.updateCalls += 1;
        dbState.setPayload = payload;
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([
                {
                  id: dbState.order?.id,
                  payment_status: payload.payment_status,
                  paid_amount: payload.paid_amount,
                },
              ]),
          }),
        };
      },
    }),
  },
}));

const { updateOrderPayment } = await import(
  "@/modules/orders/order-payment.service"
);

const CASHIER = { id: 42, role: "cashier" } as unknown as JWTPayload;

const makeOrder = (over: Partial<FakeOrderRow> = {}): FakeOrderRow => ({
  discount: "0",
  id: 10,
  payment_status: "unpaid",
  refunded_amount: "0",
  status: "ready_for_pickup",
  total: "100000",
  ...over,
});

const collect = (user: JWTPayload = CASHIER) =>
  updateOrderPayment({ orderId: 10, body: { payment_method_id: 3 }, user });

beforeEach(() => {
  dbState.order = makeOrder();
  dbState.findFirstCalls = [];
  dbState.setPayload = undefined;
  dbState.updateCalls = 0;
});

describe("updateOrderPayment", () => {
  it("collects total minus discount and stamps who took the money", async () => {
    // Rp100.000 of laundry with a Rp10.000 promo: the customer hands over
    // Rp90.000 and that exact figure becomes the order's recorded revenue,
    // tagged with the cashier and payment method for the shift report.
    dbState.order = makeOrder({ total: "100000", discount: "10000" });

    const result = await collect();

    expect(result).toEqual({
      id: 10,
      payment_status: "paid",
      paid_amount: "90000",
    });
    expect(dbState.setPayload).toMatchObject({
      paid_amount: "90000",
      paid_by: 42,
      payment_method_id: 3,
      payment_status: "paid",
      updated_by: 42,
    });
    expect(dbState.setPayload?.paid_at).toBeInstanceOf(Date);
  });

  it("deducts an earlier refund so the customer is not charged for a ruined item", async () => {
    // A shirt was ruined in the wash and Rp25.000 already went back before
    // pickup. Collecting the full Rp100.000 now would make the customer pay
    // for the very line the shop refunded.
    dbState.order = makeOrder({ total: "100000", refunded_amount: "25000" });

    await collect();

    expect(dbState.setPayload?.paid_amount).toBe("75000");
  });

  it("clamps at zero when refunds already exceed what is left to pay", async () => {
    // Discounted Rp50.000 order, Rp10.000 promo, Rp60.000 refunded after a
    // whole bag went missing. Nothing is owed — a negative paid_amount would
    // poison the revenue report with money the till never saw.
    dbState.order = makeOrder({
      total: "50000",
      discount: "10000",
      refunded_amount: "60000",
    });

    await collect();

    expect(dbState.setPayload?.paid_amount).toBe("0");
  });

  it("rejects a second collect so the same order is never charged twice", async () => {
    // Cashier taps collect twice on a laggy screen. The second tap must bounce
    // instead of overwriting paid_at/paid_by and double-counting revenue.
    dbState.order = makeOrder({ payment_status: "paid" });

    const error = await captureRejection(collect());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Order has already been paid");
    expect(dbState.updateCalls).toBe(0);
  });

  it("rejects collecting on a cancelled order", async () => {
    // The order was cancelled before pickup — taking money for it would book
    // revenue against laundry the shop never processed.
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

  it("blocks a worker before the order is even looked up", async () => {
    // Only the counter roles handle money. A worker's attempt dies at the
    // permission gate — the database is never touched, read or write.
    const worker = { id: 7, role: "worker" } as unknown as JWTPayload;

    const error = await captureRejection(collect(worker));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(dbState.findFirstCalls).toHaveLength(0);
    expect(dbState.updateCalls).toBe(0);
  });
});
