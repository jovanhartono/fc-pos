import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// Staff key a Repair's agreed price after inspection, or fix a typo while the
// Order is unpaid; once paid, prices are frozen.

type AnyObj = Record<string, unknown>;

interface FakeLine {
  complaint_id: number | null;
  id: number;
  price: string | null;
  status: string;
}

const state = {
  orderPaymentStatus: "unpaid" as string | undefined,
  line: undefined as FakeLine | undefined,
  // false = the Line was cancelled between the read and the write.
  casWins: true as boolean,
  serviceWrites: [] as AnyObj[],
  serviceWriteGuard: "",
  logRows: [] as AnyObj[],
  rollupCalls: [] as { orderId: number; userId: number }[],
  // The Order total after the new price, which the Campaign minimum is
  // re-checked against.
  postRollupTotal: "0",
  voidCalls: [] as { orderId: number; billableTotal: number }[],
};

// Every read runs in the transaction, so a payment landing mid-pricing cannot
// slip between them.
const TX = {
  query: {
    ordersTable: {
      findFirst: () =>
        Promise.resolve(
          state.orderPaymentStatus === undefined
            ? undefined
            : {
                payment_status: state.orderPaymentStatus,
                status: "processing",
                total: state.postRollupTotal,
              }
        ),
    },
    ordersServicesTable: {
      findFirst: () => Promise.resolve(state.line),
    },
  },
  update: (_table: unknown) => ({
    set: (set: AnyObj) => ({
      where: (condition: SQL) => {
        state.serviceWrites.push(set);
        state.serviceWriteGuard = new PgDialect().sqlToQuery(condition).sql;
        return {
          returning: () =>
            Promise.resolve(
              state.casWins && state.line
                ? [{ id: state.line.id, price: set.price }]
                : []
            ),
        };
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: (rows: AnyObj) => {
      state.logRows.push(rows);
      return Promise.resolve();
    },
  }),
};

mock.module("@/db", () => ({
  db: {
    transaction: (cb: (tx: unknown) => unknown) => cb(TX),
  },
}));

const actualStatusMachine = {
  ...(await import("@/modules/orders/order-status-machine")),
};

mock.module("@/modules/orders/order-status-machine", () => ({
  ...actualStatusMachine,
  recomputeOrderRollup: (_tx: unknown, orderId: number, userId: number) => {
    state.rollupCalls.push({ orderId, userId });
    return Promise.resolve();
  },
}));

const actualRedemptionService = {
  ...(await import("@/modules/campaigns/campaign-redemption.service")),
};

mock.module("@/modules/campaigns/campaign-redemption.service", () => ({
  ...actualRedemptionService,
  voidCampaignsBelowMinimum: (
    _tx: unknown,
    orderId: number,
    billableTotal: number
  ) => {
    state.voidCalls.push({ orderId, billableTotal });
    return Promise.resolve();
  },
}));

const { setOrderServicePrice } = await import(
  "@/modules/orders/order-price.service"
);

afterAll(() => {
  mock.module(
    "@/modules/orders/order-status-machine",
    () => actualStatusMachine
  );
  mock.module(
    "@/modules/campaigns/campaign-redemption.service",
    () => actualRedemptionService
  );
});

const WORKER = { id: 7, role: "worker" } as unknown as JWTPayload;

const makeLine = (over: Partial<FakeLine> = {}): FakeLine => ({
  complaint_id: null,
  id: 21,
  price: null,
  status: "processing",
  ...over,
});

const setPrice = (price: number, user: JWTPayload = WORKER) =>
  setOrderServicePrice({
    orderId: 10,
    serviceId: 21,
    body: { price },
    user,
  });

beforeEach(() => {
  state.orderPaymentStatus = "unpaid";
  state.line = makeLine();
  state.casWins = true;
  state.serviceWrites = [];
  state.serviceWriteGuard = "";
  state.logRows = [];
  state.rollupCalls = [];
  state.postRollupTotal = "0";
  state.voidCalls = [];
});

describe("setOrderServicePrice", () => {
  it("prices a blank repair line and logs who put the first number on it", async () => {
    // Inspection agrees 250k over WhatsApp; any staff may key it (ADR-0018),
    // and the log shows it was a first price, not a correction.
    const result = await setPrice(250_000);

    expect(result.price).toBe("250000");
    expect(state.logRows).toEqual([
      {
        order_service_id: 21,
        changed_by: 7,
        from_price: null,
        to_price: "250000",
      },
    ]);
  });

  it("refreshes the order total so the counter asks for the agreed number", async () => {
    await setPrice(250_000);

    expect(state.rollupCalls).toEqual([{ orderId: 10, userId: 7 }]);
  });

  it("corrects a priced line while unpaid, keeping the from→to trail", async () => {
    // A typo of 20k for 200k; the log keeps both, so quiet mark-downs by one
    // User stay visible.
    state.line = makeLine({ price: "20000" });

    const result = await setPrice(200_000);

    expect(result.price).toBe("200000");
    expect(state.logRows).toEqual([
      {
        order_service_id: 21,
        changed_by: 7,
        from_price: "20000",
        to_price: "200000",
      },
    ]);
  });

  it("refuses any price change once the order is paid — the numbers froze", async () => {
    // After payment a wrong price is a Refund, not an edit (ADR-0018).
    state.orderPaymentStatus = "paid";

    const error = await captureRejection(setPrice(250_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order has been paid — its prices are frozen"
    );
    expect(state.serviceWrites).toHaveLength(0);
    expect(state.logRows).toHaveLength(0);
  });

  it("refuses to price a cancelled line — nobody owes its number", async () => {
    // The Customer declined the quote (ADR-0008); pricing it would charge for
    // work the shop is not doing.
    state.line = makeLine({ status: "cancelled" });

    const error = await captureRejection(setPrice(250_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Cannot set a price on a cancelled line"
    );
    expect(state.serviceWrites).toHaveLength(0);
  });

  it("refuses to price a rework on an Order still unpaid at the counter", async () => {
    // The Customer turned the Item down before paying; its Rework line is free.
    state.line = makeLine({ complaint_id: 5, price: "0", status: "queued" });

    const error = await captureRejection(setPrice(50_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "A rework is free — its price is fixed"
    );
    expect(state.serviceWrites).toHaveLength(0);
    expect(state.logRows).toHaveLength(0);
  });

  it("refuses zero — 0 means deliberately free, which is a Rework, not a price", async () => {
    const error = await captureRejection(setPrice(0));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Price must be greater than zero");
    expect(state.serviceWrites).toHaveLength(0);
  });

  it("will not land a price on a line the counter cancelled mid-typing", async () => {
    // The Customer declines at the counter while the workshop is still typing,
    // so the write itself must re-check the status.
    await setPrice(250_000);

    expect(state.serviceWriteGuard).toContain('"status" <>');
  });

  it("will not land a correction after another cashier collected payment", async () => {
    // A cashier collects while the workshop fixes a typo; landing after payment
    // would leave a Receipt that no longer matches the charge (ADR-0018).
    await setPrice(250_000);

    expect(state.serviceWriteGuard).toContain("\"payment_status\" = 'unpaid'");
  });

  it("loses the race cleanly when the counter moved first", async () => {
    state.casWins = false;

    const error = await captureRejection(setPrice(250_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "The order was paid or this line was cancelled while you were pricing it. Refresh and try again."
    );
    expect(state.logRows).toHaveLength(0);
    expect(state.rollupCalls).toHaveLength(0);
  });

  it("re-checks the promo minimum against the corrected total", async () => {
    // A Repair typo of 210k is corrected to 10k, leaving 160k; "100k off, min
    // 250k" must not stay on a 160k Order.
    state.line = makeLine({ price: "210000" });
    state.postRollupTotal = "160000";

    await setPrice(10_000);

    expect(state.voidCalls).toEqual([{ orderId: 10, billableTotal: 160_000 }]);
  });

  it("re-checks nothing until the price actually landed", async () => {
    // The correction lost the race; voiding now would strip a discount for nothing.
    state.casWins = false;

    await captureRejection(setPrice(10_000));

    expect(state.voidCalls).toHaveLength(0);
  });
});
