import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// setOrderServicePrice is where a Repair line's number becomes real money:
// the workshop opened the bag, agreed a price with the customer, and keys it
// in — or re-keys it to fix a typo while the Order is still unpaid. These
// tests pin what must land atomically — the line price, the who-set-what log
// row, the refreshed order total — and every state that must refuse a write:
// a paid order (prices are frozen), a cancelled line, a keyed zero.

type AnyObj = Record<string, unknown>;

interface FakeLine {
  id: number;
  price: string | null;
  status: string;
}

const state = {
  orderPaymentStatus: "unpaid" as string | undefined,
  line: undefined as FakeLine | undefined,
  // Simulates losing the race: the line was cancelled between read and write.
  casWins: true,
  serviceWrites: [] as AnyObj[],
  serviceWriteGuard: "",
  logRows: [] as AnyObj[],
  rollupCalls: [] as { orderId: number; userId: number }[],
  // orders.total as recomputeOrderRollup leaves it — what the promo minimum is
  // re-checked against once the corrected price has landed.
  postRollupTotal: "0",
  voidCalls: [] as { orderId: number; billableTotal: number }[],
};

const TX = {
  query: {
    ordersTable: {
      findFirst: () => Promise.resolve({ total: state.postRollupTotal }),
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

// Real repositories create prepared statements at import time, so the fake db
// must let any db.query.<table>.findFirst chain into .prepare() — and still
// resolve when awaited (the paid gate reads the order this way).
const relationalQuery = (first: () => unknown) => ({
  findFirst: () =>
    Object.assign(Promise.resolve().then(first), {
      prepare: () => ({ execute: () => Promise.resolve(undefined) }),
    }),
  findMany: () =>
    Object.assign(Promise.resolve([] as unknown[]), {
      prepare: () => ({ execute: () => Promise.resolve([]) }),
    }),
});

mock.module("@/db", () => ({
  db: {
    transaction: (cb: (tx: unknown) => unknown) => cb(TX),
    query: new Proxy(
      {},
      {
        get: (_target, tableName) =>
          relationalQuery(() =>
            tableName === "ordersTable" &&
            state.orderPaymentStatus !== undefined
              ? { payment_status: state.orderPaymentStatus }
              : undefined
          ),
      }
    ),
  },
}));

// The repository is doubled, not the prepared statement under it — real
// repositories bind their prepared queries to whatever "@/db" existed at
// import time, which in a shared test process is another file's double.
const actualOrderRepository = {
  ...(await import("@/modules/orders/order.repository")),
};

mock.module("@/modules/orders/order.repository", () => ({
  ...actualOrderRepository,
  getOrderServiceOrThrow: (_orderId: number, _serviceId: number) => {
    if (!state.line) {
      throw new BadRequestException("Order service not found for this order");
    }
    return Promise.resolve(state.line);
  },
}));

// recomputeOrderRollup runs its own queries against the tx; its arithmetic
// (billable total, discount clamp) is pinned in order-status-machine.test.ts.
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

// The void rule's own arithmetic (which minimums, releasing redemptions,
// zeroing the discount) is pinned in campaign-redemption tests; here we only
// pin that pricing hands it the freshly recomputed total.
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
  mock.module("@/modules/orders/order.repository", () => actualOrderRepository);
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
    // The bag came in unpriceable; teardown says a full re-panel — 250k,
    // agreed over WhatsApp. Any staff may key it (ADR-0018: not behind the
    // money gate); the from-NULL log row is the audit that it was a first
    // pricing, not a correction.
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
    // The claim ticket printed at drop-off showed a total without the repair;
    // once 250k is agreed the amount due must be recomputed from the lines,
    // in the same transaction that priced one of them.
    await setPrice(250_000);

    expect(state.rollupCalls).toEqual([{ orderId: 10, userId: 7 }]);
  });

  it("corrects a priced line while unpaid, keeping the from→to trail", async () => {
    // The cashier fat-fingered 20k for the 200k agreed with the customer.
    // Until payment the number may be re-keyed — the log keeps both figures,
    // so a pattern of quiet mark-downs by one user stays visible.
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
    // The customer paid against a printed receipt and the till matches it.
    // Editing a line after that would desync money already taken; a genuinely
    // wrong price is now a refund, not an edit (ADR-0018).
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
    // Customer heard the quote and walked; the line took the unpaid off-ramp
    // (ADR-0008). Pricing it now would push the amount due back up for work
    // the shop is not doing.
    state.line = makeLine({ status: "cancelled" });

    const error = await captureRejection(setPrice(250_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Cannot set a price on a cancelled line"
    );
    expect(state.serviceWrites).toHaveLength(0);
  });

  it("refuses zero — 0 means deliberately free, which is a Rework, not a price", async () => {
    const error = await captureRejection(setPrice(0));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Price must be greater than zero");
    expect(state.serviceWrites).toHaveLength(0);
  });

  it("will not land a price on a line the counter cancelled mid-typing", async () => {
    // The customer declines at the counter while the workshop still has the
    // pricing screen open. Checking the status only on the way in would let
    // the price land on a line nobody owes — the write itself must re-check.
    await setPrice(250_000);

    expect(state.serviceWriteGuard).toContain('"status" <>');
  });

  it("will not land a correction after another cashier collected payment", async () => {
    // The workshop re-keys a typo while a cashier taps collect on another
    // till. If the correction landed after the paid CAS, the customer would
    // hold a receipt whose lines no longer sum to what was charged — the
    // exact state ADR-0018 forbids. The pre-check read cannot see a payment
    // that commits after it, so the write itself must require the order to
    // still be unpaid.
    await setPrice(250_000);

    expect(state.serviceWriteGuard).toContain("\"payment_status\" = 'unpaid'");
  });

  it("loses the race cleanly when the counter moved first", async () => {
    // The cancel or the payment won: the guarded write matches nothing, and
    // neither a log row nor a total refresh may survive the rollback.
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
    // A promo settled at drop-off on a fully priced Order and printed on the
    // Receipt. The workshop then corrects the repair down — 210k was a typo
    // for 10k — leaving 160k. Without this re-check, "100k off, min 250k"
    // rides a 160k Order and the customer pays 60k for 160k of work.
    state.line = makeLine({ price: "210000" });
    state.postRollupTotal = "160000";

    await setPrice(10_000);

    expect(state.voidCalls).toEqual([{ orderId: 10, billableTotal: 160_000 }]);
  });

  it("re-checks nothing until the price actually landed", async () => {
    // The correction lost the race, so the total never moved — voiding a promo
    // off the back of a rolled-back write would strip a discount for free.
    state.casWins = false;

    await captureRejection(setPrice(10_000));

    expect(state.voidCalls).toHaveLength(0);
  });
});
