import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  orderRefundItemsTable,
  orderRefundsTable,
  ordersProductsTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import type {
  PostOrderCancelInput,
  PostOrderRefundInput,
} from "@/modules/orders/order-admin.schema";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// The reversal desk: refund hands cash back on a PAID order line by line;
// cancel voids lines on an UNPAID order, putting products back on the shelf
// and freeing any voucher the order had spent (ADR-0008 / ADR-0015). These
// tests pin the wiring from DB rows through per-line caps to the money writes,
// and the exactly-once voucher release on a full cancel. The cap/allocation
// arithmetic stays real (refund-allocation.test.ts owns it), as does the
// permission gate; the DB, status machine, stock repository, and redemption
// release are doubled at their seams and only their invocations asserted.

type AnyObj = Record<string, unknown>;

interface UpdateCall {
  set: AnyObj;
  table: unknown;
}

interface InsertCall {
  table: unknown;
  values: AnyObj | AnyObj[];
}

const state = {
  order: undefined as AnyObj | undefined, // db.query.ordersTable.findFirst
  serviceRows: [] as AnyObj[], // db.query.ordersServicesTable.findMany
  productRows: [] as AnyObj[], // db.query.ordersProductsTable.findMany
  refundedRows: [] as AnyObj[], // prior-refund SUM rows (db.select chain)
  postCancelStatus: undefined as string | undefined, // tx re-read after cancel
  casResults: [] as { id: number }[][], // queued CAS update outcomes, in order
};

const reads = { orderLookups: 0 };

const writes = {
  updates: [] as UpdateCall[],
  inserts: [] as InsertCall[],
  transactionCount: 0,
};

const updateBuilder = (table: unknown) => ({
  set: (values: AnyObj) => {
    writes.updates.push({ set: values, table });
    return {
      // Drizzle's builder is awaitable mid-chain AND continuable via
      // .returning() — a real Promise with the method attached mirrors that.
      where: () =>
        Object.assign(Promise.resolve(undefined), {
          returning: () =>
            Promise.resolve(state.casResults.shift() ?? [{ id: 1 }]),
        }),
    };
  },
});

const insertBuilder = (table: unknown) => ({
  values: (values: AnyObj | AnyObj[]) => {
    writes.inserts.push({ table, values });
    return Object.assign(Promise.resolve(undefined), {
      returning: () => Promise.resolve([{ id: 900, ...(values as AnyObj) }]),
    });
  },
});

const fakeTx = {
  update: updateBuilder,
  insert: insertBuilder,
  query: {
    ordersTable: {
      findFirst: () =>
        Promise.resolve(
          state.postCancelStatus == null
            ? undefined
            : { status: state.postCancelStatus }
        ),
    },
  },
};

mock.module("@/db", () => ({
  db: {
    query: {
      ordersTable: {
        findFirst: () => {
          reads.orderLookups += 1;
          return Promise.resolve(state.order);
        },
      },
      ordersServicesTable: {
        findMany: () => Promise.resolve(state.serviceRows),
      },
      ordersProductsTable: {
        findMany: () => Promise.resolve(state.productRows),
      },
      // The real product.repository (captured below for the spread mock)
      // builds a prepared statement at module scope; give it something inert
      // to chain on so the import does not explode.
      productsTable: {
        findFirst: () => ({
          prepare: () => ({ execute: () => Promise.resolve(undefined) }),
        }),
      },
    },
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            groupBy: () => Promise.resolve(state.refundedRows),
          }),
        }),
      }),
    }),
    transaction: (cb: (tx: unknown) => unknown) => {
      writes.transactionCount += 1;
      return cb(fakeTx);
    },
  },
}));

// Spread the real modules so only the seams under observation are replaced,
// and restore the actuals in afterAll — other test files pin these modules'
// internals for real and must not inherit the stubs (mock.module is
// process-global for the whole run).
const machine = {
  refundTransitions: [] as { executor: unknown; input: AnyObj }[],
  serviceTransitions: [] as { executor: unknown; input: AnyObj }[],
  rollupCalls: [] as { executor: unknown; orderId: number; userId: number }[],
};

const actualStatusMachine = await import(
  "@/modules/orders/order-status-machine"
);

mock.module("@/modules/orders/order-status-machine", () => ({
  ...actualStatusMachine,
  applyRefundTransition: (executor: unknown, input: AnyObj) => {
    machine.refundTransitions.push({ executor, input });
    return Promise.resolve();
  },
  transitionOrderService: (executor: unknown, input: AnyObj) => {
    machine.serviceTransitions.push({ executor, input });
    return Promise.resolve();
  },
  recomputeOrderRollup: (
    executor: unknown,
    orderId: number,
    userId: number
  ) => {
    machine.rollupCalls.push({ executor, orderId, userId });
    return Promise.resolve();
  },
}));

const redemption = {
  releaseCalls: [] as { executor: unknown; orderId: number }[],
};

const actualRedemption = await import(
  "@/modules/campaigns/campaign-redemption.service"
);

mock.module("@/modules/campaigns/campaign-redemption.service", () => ({
  ...actualRedemption,
  releaseRedemptions: (executor: unknown, orderId: number) => {
    redemption.releaseCalls.push({ executor, orderId });
    return Promise.resolve();
  },
}));

const stock = {
  calls: [] as { executor: unknown; productId: number; qty: number }[],
};

const actualProductRepo = await import("@/modules/products/product.repository");

mock.module("@/modules/products/product.repository", () => ({
  ...actualProductRepo,
  incrementProductStock: (
    executor: unknown,
    productId: number,
    qty: number
  ) => {
    stock.calls.push({ executor, productId, qty });
    return Promise.resolve([{ id: productId }]);
  },
}));

afterAll(() => {
  mock.module(
    "@/modules/orders/order-status-machine",
    () => actualStatusMachine
  );
  mock.module(
    "@/modules/campaigns/campaign-redemption.service",
    () => actualRedemption
  );
  mock.module("@/modules/products/product.repository", () => actualProductRepo);
});

const { cancelOrder, createOrderRefund } = await import(
  "@/modules/orders/order-reversal.service"
);

// Refund is admin-only and cancel admits admin too, so one user covers both
// desks; the role matrix itself is pinned in permissions tests.
const ADMIN = { id: 42, role: "admin" } as unknown as JWTPayload;

// The refunded_amount increment is written as a SQL template ("refunded_amount
// + N"); the interpolated amount sits in queryChunks as a plain number, so dig
// it out to pin what actually lands in the ledger.
const sqlNumberChunks = (value: unknown): number[] => {
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks.filter((chunk): chunk is number => typeof chunk === "number");
};

const refund = (items: AnyObj[]) =>
  createOrderRefund({
    orderId: 1,
    body: { items } as unknown as PostOrderRefundInput,
    user: ADMIN,
  });

const cancel = (items: AnyObj[]) =>
  cancelOrder({
    orderId: 5,
    body: { items } as unknown as PostOrderCancelInput,
    user: ADMIN,
  });

// Postgres numerics arrive as strings — fixtures feed strings so the service's
// Number() coercion stays under test.
const makePaidOrder = (over: AnyObj = {}) => ({
  id: 1,
  payment_status: "paid",
  paid_amount: "90000",
  refunded_amount: "0",
  total: "100000",
  discount: "10000",
  ...over,
});

const makeUnpaidOrder = (over: AnyObj = {}) => ({
  id: 5,
  status: "processing",
  payment_status: "unpaid",
  ...over,
});

beforeEach(() => {
  state.order = undefined;
  state.serviceRows = [];
  state.productRows = [];
  state.refundedRows = [];
  state.postCancelStatus = undefined;
  state.casResults = [];
  reads.orderLookups = 0;
  writes.updates = [];
  writes.inserts = [];
  writes.transactionCount = 0;
  machine.refundTransitions = [];
  machine.serviceTransitions = [];
  machine.rollupCalls = [];
  redemption.releaseCalls = [];
  stock.calls = [];
});

describe("createOrderRefund", () => {
  it("returns exactly what the customer paid for a whole wash on a discounted order", async () => {
    // Rp100.000 wash bought with a Rp10.000 promo: the customer paid 90.000.
    // Returning the sticker price would hand the shop's discount back in cash;
    // the ledger, the refund record, and the status flip must all say 90.000.
    state.order = makePaidOrder();
    state.serviceRows = [{ id: 10, subtotal: "100000" }];

    const result = await refund([{ order_service_id: 10, reason: "damaged" }]);

    expect(result.total_refund_amount).toBe(90_000);
    expect(result.refund.id).toBe(900);
    expect(writes.transactionCount).toBe(1);

    const orderUpdate = writes.updates.find((u) => u.table === ordersTable);
    expect(orderUpdate?.set.updated_by).toBe(42);
    expect(sqlNumberChunks(orderUpdate?.set.refunded_amount)).toEqual([90_000]);

    const refundInsert = writes.inserts.find(
      (i) => i.table === orderRefundsTable
    );
    expect(refundInsert?.values).toEqual({
      order_id: 1,
      refunded_by: 42,
      total_amount: "90000",
    });

    const itemsInsert = writes.inserts.find(
      (i) => i.table === orderRefundItemsTable
    );
    expect(itemsInsert?.values).toEqual([
      {
        order_refund_id: 900,
        order_service_id: 10,
        order_product_id: null,
        amount: "90000",
        reason: "damaged",
        note: undefined,
      },
    ]);

    // The garment itself must flip to refunded so it cannot be handed out.
    expect(machine.refundTransitions).toEqual([
      {
        executor: fakeTx,
        input: {
          orderId: 1,
          by: 42,
          items: [{ serviceId: 10, note: undefined }],
        },
      },
    ]);
  });

  it("refuses a refund larger than the cash still held for the order", async () => {
    // Two Rp50.000 washes; the customer paid 60.000 up front and already got
    // 20.000 back. The line's cap says 50.000 is returnable, but the till only
    // holds 40.000 of their money — paying out would refund cash never received.
    state.order = makePaidOrder({
      paid_amount: "60000",
      refunded_amount: "20000",
      discount: "0",
    });
    state.serviceRows = [
      { id: 10, subtotal: "50000" },
      { id: 11, subtotal: "50000" },
    ];

    const error = await captureRejection(
      refund([{ order_service_id: 10, reason: "damaged" }])
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Refund exceeds remaining paid amount for this order"
    );
    // No transaction means no partial money writes to unwind.
    expect(writes.transactionCount).toBe(0);
    expect(writes.updates).toHaveLength(0);
    expect(writes.inserts).toHaveLength(0);
  });

  it("pays out only the remainder on a second refund of the same shirt", async () => {
    // The shirt already got Rp40.000 back last week. Its discounted worth is
    // 45.000 (50.000 gross minus its share of the 10.000 promo), so a second
    // visit can only claim the 5.000 still outstanding — the prior-refund SUM
    // row arrives as a string and must land on the right line.
    state.order = makePaidOrder({ refunded_amount: "40000" });
    state.serviceRows = [
      { id: 10, subtotal: "50000" },
      { id: 11, subtotal: "50000" },
    ];
    state.refundedRows = [
      { order_service_id: 10, order_product_id: null, refunded_total: "40000" },
    ];

    const result = await refund([{ order_service_id: 10, reason: "damaged" }]);

    expect(result.total_refund_amount).toBe(5000);
    const refundInsert = writes.inserts.find(
      (i) => i.table === orderRefundsTable
    );
    expect(refundInsert?.values).toMatchObject({ total_amount: "5000" });
  });

  it("stamps the bottle refunded so no later cancel can restock it", async () => {
    // Rp30.000 detergent bottle refunded in full. Beyond moving the cash, the
    // row must be stamped refunded_at — that stamp is the only thing later
    // gates trust (no second refund, no cancel-after-refund putting a
    // paid-out bottle back on the shelf). Cash out without the stamp quietly
    // re-arms both double-outs.
    state.order = makePaidOrder({
      discount: "0",
      total: "30000",
      paid_amount: "30000",
    });
    state.productRows = [
      { id: 20, subtotal: "30000", refunded_at: null, cancelled_at: null },
    ];

    const result = await refund([{ order_product_id: 20, reason: "damaged" }]);

    expect(result.total_refund_amount).toBe(30_000);

    const stamp = writes.updates.find((u) => u.table === ordersProductsTable);
    expect(stamp?.set.refunded_at).toBeInstanceOf(Date);

    // A bottle refund never flips any garment's status.
    expect(machine.refundTransitions).toHaveLength(0);
  });

  it("never refunds a product line that already took an off-ramp", async () => {
    // The detergent bottle was refunded on a previous visit and its row is
    // stamped refunded_at. Arithmetic would still show Rp30.000 of headroom,
    // but the stamp is authoritative — paying again is double cash out.
    state.order = makePaidOrder({ discount: "0", total: "30000" });
    state.productRows = [
      {
        id: 20,
        subtotal: "30000",
        refunded_at: new Date("2026-07-01T00:00:00Z"),
        cancelled_at: null,
      },
    ];

    const error = await captureRejection(
      refund([{ order_product_id: 20, reason: "damaged" }])
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order product 20 has no refundable amount remaining"
    );
    expect(writes.transactionCount).toBe(0);
  });

  it("rejects a double-tapped line before touching the order", async () => {
    // A cashier double-taps submit and the same shirt arrives twice in one
    // request — paying it out twice is straight money lost. Rejected before
    // any lookup or write.
    const error = await captureRejection(
      refund([
        { order_service_id: 10, reason: "damaged" },
        { order_service_id: 10, reason: "damaged" },
      ])
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Duplicate refund line entries are not allowed"
    );
    expect(reads.orderLookups).toBe(0);
    expect(writes.transactionCount).toBe(0);
  });

  it("rejects an item that points at no line at all", async () => {
    // An item naming neither a service nor a product could only pay out
    // against nothing; rejected before any lookup or write.
    const error = await captureRejection(refund([{ reason: "damaged" }]));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Each refund item must reference a service or product line"
    );
    expect(reads.orderLookups).toBe(0);
    expect(writes.transactionCount).toBe(0);
  });
});

describe("cancelOrder", () => {
  it("restores stock, recomputes the rollup, and frees the voucher when the last line dies", async () => {
    // Unpaid order whose only live line is 3 detergent bottles. Cancelling it
    // puts the 3 bottles back on the shelf, folds the void into the order
    // rollup, and — because the whole order is now cancelled — releases the
    // campaign redemption so the customer's voucher is spendable again
    // (ADR-0015).
    state.order = makeUnpaidOrder();
    state.productRows = [
      { id: 30, qty: 3, product_id: 12, refunded_at: null, cancelled_at: null },
    ];
    state.postCancelStatus = "cancelled";

    const result = await cancel([
      { order_product_id: 30, reason: "customer_request" },
    ]);

    expect(result).toEqual({
      cancelled_service_ids: [],
      cancelled_product_ids: [30],
      order_id: 5,
    });

    expect(stock.calls).toEqual([{ executor: fakeTx, productId: 12, qty: 3 }]);
    expect(machine.rollupCalls).toEqual([
      { executor: fakeTx, orderId: 5, userId: 42 },
    ]);
    expect(redemption.releaseCalls).toEqual([{ executor: fakeTx, orderId: 5 }]);

    const casUpdate = writes.updates.find(
      (u) => u.table === ordersProductsTable
    );
    expect(casUpdate?.set.cancelled_at).toBeInstanceOf(Date);
    expect(casUpdate?.set.cancel_reason).toBe("customer_request");
    expect(casUpdate?.set.cancel_note).toBeNull();
  });

  it("does not release the voucher again when the order was already cancelled", async () => {
    // The order arrived at the desk already cancelled; a straggler line gets
    // voided after the fact. The post-tx status still reads "cancelled", but
    // the redemption was released the first time — releasing again would mint
    // the customer a second free voucher use.
    state.order = makeUnpaidOrder({ status: "cancelled" });
    state.productRows = [
      { id: 30, qty: 1, product_id: 12, refunded_at: null, cancelled_at: null },
    ];
    state.postCancelStatus = "cancelled";

    await cancel([{ order_product_id: 30, reason: "customer_request" }]);

    expect(redemption.releaseCalls).toHaveLength(0);
  });

  it("keeps the voucher locked while other lines are still in the wash", async () => {
    // Multi-line ticket: the customer drops one detergent bottle but their
    // wash stays in the machine, so the order re-reads as "processing" after
    // the void. The voucher still funds the surviving lines — releasing it
    // now would let the customer spend it a second time on top of this order.
    state.order = makeUnpaidOrder();
    state.productRows = [
      { id: 30, qty: 1, product_id: 12, refunded_at: null, cancelled_at: null },
    ];
    state.postCancelStatus = "processing";

    await cancel([{ order_product_id: 30, reason: "customer_request" }]);

    // The dropped bottle still goes back on the shelf...
    expect(stock.calls).toEqual([{ executor: fakeTx, productId: 12, qty: 1 }]);
    // ...but the redemption stays attached to the still-live order.
    expect(redemption.releaseCalls).toHaveLength(0);
  });

  it("lets the loser of a concurrent cancel fail before touching stock", async () => {
    // Two staff cancel the same bottle at once. The pre-check saw it live, but
    // the winner stamped it first, so the loser's CAS update matches nothing.
    // Restoring stock anyway would count the same bottle back in twice.
    state.order = makeUnpaidOrder();
    state.productRows = [
      { id: 31, qty: 2, product_id: 12, refunded_at: null, cancelled_at: null },
    ];
    state.casResults = [[]];

    const error = await captureRejection(
      cancel([{ order_product_id: 31, reason: "customer_request" }])
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Product line 31 was already cancelled or refunded"
    );
    expect(stock.calls).toHaveLength(0);
  });

  it("refuses to cancel a line the shop already refunded", async () => {
    // Refund means money moved; a cancel on top would also restore stock for a
    // bottle whose cash already went back. Rejected before any write.
    state.order = makeUnpaidOrder();
    state.productRows = [
      {
        id: 32,
        qty: 1,
        product_id: 9,
        refunded_at: new Date("2026-07-01T00:00:00Z"),
        cancelled_at: null,
      },
    ];

    const error = await captureRejection(
      cancel([{ order_product_id: 32, reason: "customer_request" }])
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Product line 32 is refunded and cannot be cancelled"
    );
    expect(writes.transactionCount).toBe(0);
  });

  it("refuses a line that does not belong to this order", async () => {
    // A stale tab submits a line id from another order; voiding it here would
    // restore stock against the wrong ticket. Rejected before any write.
    state.order = makeUnpaidOrder();
    state.productRows = [];

    const error = await captureRejection(
      cancel([{ order_product_id: 33, reason: "customer_request" }])
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Product line 33 not found on this order"
    );
    expect(writes.transactionCount).toBe(0);
  });
});
