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

// A Refund returns money on a paid Order; a Cancellation takes Lines off an
// unpaid one, restocking Products and freeing its Voucher codes (ADR-0008, ADR-0015).

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
  order: undefined as AnyObj | undefined,
  serviceRows: [] as AnyObj[],
  productRows: [] as AnyObj[],
  refundedRows: [] as AnyObj[],
  postCancelStatus: undefined as string | undefined,
  postCancelPaymentStatus: "unpaid" as string,
  postCancelTotal: "0" as string | null,
  casResults: [] as { id: number }[][],
  // Only the two-tabs race case runs the real refund transition.
  realRefundTransition: false as boolean,
};

const writes = {
  updates: [] as UpdateCall[],
  inserts: [] as InsertCall[],
  transactionCount: 0,
};

const updateBuilder = (table: unknown) => ({
  set: (values: AnyObj) => {
    writes.updates.push({ set: values, table });
    return {
      // Drizzle's builder can be awaited or continued with .returning().
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

const selectBuilder = () => ({
  from: () => ({
    where: () => ({
      for: () => Promise.resolve(state.order ? [state.order] : []),
    }),
    innerJoin: () => ({
      where: () => ({
        groupBy: () => Promise.resolve(state.refundedRows),
      }),
    }),
  }),
});

const fakeTx = {
  update: updateBuilder,
  insert: insertBuilder,
  select: selectBuilder,
  query: {
    ordersTable: {
      findFirst: () =>
        Promise.resolve(
          state.postCancelStatus == null
            ? state.order
            : {
                payment_status: state.postCancelPaymentStatus,
                status: state.postCancelStatus,
                total: state.postCancelTotal,
              }
        ),
    },
    ordersServicesTable: {
      findMany: () => Promise.resolve(state.serviceRows),
    },
    ordersProductsTable: {
      findMany: () => Promise.resolve(state.productRows),
    },
  },
};

mock.module("@/db", () => ({
  db: {
    query: {
      ordersTable: {
        findFirst: () => Promise.resolve(state.order),
      },
      ordersProductsTable: {
        findMany: () => Promise.resolve(state.productRows),
      },
      // product.repository prepares a statement on import.
      productsTable: {
        findFirst: () => ({
          prepare: () => ({ execute: () => Promise.resolve(undefined) }),
        }),
      },
    },
    transaction: (cb: (tx: unknown) => unknown) => {
      writes.transactionCount += 1;
      return cb(fakeTx);
    },
  },
}));

// mock.module is global to the run, so afterAll restores the real modules
// for the test files that use them.
const machine = {
  refundTransitions: [] as { executor: unknown; input: AnyObj }[],
  serviceCancels: [] as { executor: unknown; input: AnyObj }[],
  rollupCalls: [] as { executor: unknown; orderId: number; userId: number }[],
};

const actualStatusMachine = await import(
  "@/modules/orders/order-status-machine"
);

// Held before mocking: read later off the namespace, it would be the double.
const realApplyRefundTransition = actualStatusMachine.applyRefundTransition;

mock.module("@/modules/orders/order-status-machine", () => ({
  ...actualStatusMachine,
  applyRefundTransition: (executor: unknown, input: AnyObj) => {
    machine.refundTransitions.push({ executor, input });
    return state.realRefundTransition
      ? realApplyRefundTransition(
          executor as Parameters<typeof realApplyRefundTransition>[0],
          input as unknown as Parameters<typeof realApplyRefundTransition>[1]
        )
      : Promise.resolve();
  },
  cancelOrderServices: (executor: unknown, input: AnyObj) => {
    machine.serviceCancels.push({ executor, input });
    return Promise.resolve({ reworkIds: [] });
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
  voidCalls: [] as { billableTotal: number; orderId: number }[],
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
  voidCampaignsBelowMinimum: (
    _tx: unknown,
    orderId: number,
    billableTotal: number
  ) => {
    redemption.voidCalls.push({ orderId, billableTotal });
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

const ADMIN = { id: 42, role: "admin" } as unknown as JWTPayload;

// refunded_amount is written as SQL "refunded_amount + N"; this pulls out N.
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

// Strings, because Postgres numerics arrive as strings.
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
  state.postCancelPaymentStatus = "unpaid";
  state.postCancelTotal = "0";
  state.casResults = [];
  state.realRefundTransition = false;
  writes.updates = [];
  writes.inserts = [];
  writes.transactionCount = 0;
  machine.refundTransitions = [];
  machine.serviceCancels = [];
  machine.rollupCalls = [];
  redemption.releaseCalls = [];
  redemption.voidCalls = [];
  stock.calls = [];
});

describe("createOrderRefund", () => {
  it("returns exactly what the customer paid for a whole wash on a discounted order", async () => {
    // A Rp100.000 clean paid at 90.000 after a discount refunds 90.000, not
    // the list price, or the discount goes back out in cash.
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

    // The OrderService becomes refunded so it cannot be handed out.
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
    // The Line could return 50.000, but only 40.000 of the Customer's money is
    // left after an earlier Refund.
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
    expect(writes.updates).toHaveLength(0);
    expect(writes.inserts).toHaveLength(0);
  });

  it("pays out only the remainder on a second refund of the same shirt", async () => {
    // Worth 45.000 after its share of the discount, 40.000 already refunded:
    // a second Refund pays only the 5.000 left.
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
    // refunded_at is what later blocks a second Refund, or a Cancellation that
    // would restock a Product already paid back.
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

    expect(machine.refundTransitions).toHaveLength(0);
  });

  it("never refunds a product line that already took an off-ramp", async () => {
    // The amounts would still allow 30.000, but refunded_at wins: paying again
    // is money out twice.
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
    expect(writes.updates).toHaveLength(0);
    expect(writes.inserts).toHaveLength(0);
  });

  it("refuses the second of two refunds racing for the same pair of shoes", async () => {
    // An admin submits the same Refund from two tabs; the second must not pay
    // out again.
    state.order = makePaidOrder();
    state.serviceRows = [
      { id: 10, subtotal: "100000", status: "ready_for_pickup" },
    ];
    state.realRefundTransition = true;
    state.casResults = [[]];

    const error = await captureRejection(
      refund([{ order_service_id: 10, reason: "damaged" }])
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Someone just changed this line. Refresh and try again."
    );
  });

  it("rejects a double-tapped line before touching the order", async () => {
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
    expect(writes.transactionCount).toBe(0);
  });

  it("rejects an item that points at no line at all", async () => {
    const error = await captureRejection(refund([{ reason: "damaged" }]));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Each refund item must reference a service or product line"
    );
    expect(writes.transactionCount).toBe(0);
  });
});

describe("cancelOrder", () => {
  it("restores stock, recomputes the rollup, and frees the voucher when the last line dies", async () => {
    // Cancelling the last Line restocks it and, with the whole Order now
    // cancelled, frees the Customer's Voucher code again (ADR-0015).
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

  it("hands every voided treatment to the cancel seam in one go", async () => {
    // The Customer drops two OrderServices at once; both cancel together so
    // the amount due changes once, not Line by Line.
    state.order = makeUnpaidOrder();
    state.postCancelStatus = "processing";

    await cancel([
      { order_service_id: 11, reason: "customer_request" },
      {
        order_service_id: 12,
        reason: "customer_request",
        note: "changed mind",
      },
    ]);

    expect(machine.serviceCancels).toEqual([
      {
        executor: fakeTx,
        input: {
          by: 42,
          lines: [
            { note: undefined, reason: "customer_request", serviceId: 11 },
            {
              note: "changed mind",
              reason: "customer_request",
              serviceId: 12,
            },
          ],
          orderId: 5,
        },
      },
    ]);
  });

  it("does not release the voucher again when the order was already cancelled", async () => {
    // The Order was already cancelled and its Voucher code freed; freeing it
    // again would give the Customer a second use.
    state.order = makeUnpaidOrder({ status: "cancelled" });
    state.productRows = [
      { id: 30, qty: 1, product_id: 12, refunded_at: null, cancelled_at: null },
    ];
    state.postCancelStatus = "cancelled";

    await cancel([{ order_product_id: 30, reason: "customer_request" }]);

    expect(redemption.releaseCalls).toHaveLength(0);
  });

  it("keeps the voucher locked while other lines are still in the wash", async () => {
    // The Customer drops one Product but the clean goes on; the Voucher code
    // still covers what is left, so freeing it would allow a second use.
    state.order = makeUnpaidOrder();
    state.productRows = [
      { id: 30, qty: 1, product_id: 12, refunded_at: null, cancelled_at: null },
    ];
    state.postCancelStatus = "processing";

    await cancel([{ order_product_id: 30, reason: "customer_request" }]);

    expect(stock.calls).toEqual([{ executor: fakeTx, productId: 12, qty: 1 }]);
    expect(redemption.releaseCalls).toHaveLength(0);
  });

  it("re-checks the promo minimum against what survives a partial cancel", async () => {
    // A "min Rp250.000" Campaign settled at drop-off; after Cancellations only
    // Rp110.000 is left, so the minimum is checked again.
    state.order = makeUnpaidOrder();
    state.productRows = [
      { id: 30, qty: 1, product_id: 12, refunded_at: null, cancelled_at: null },
    ];
    state.postCancelStatus = "processing";
    state.postCancelTotal = "110000";

    await cancel([{ order_product_id: 30, reason: "customer_request" }]);

    expect(redemption.voidCalls).toEqual([
      { orderId: 5, billableTotal: 110_000 },
    ]);
    expect(redemption.releaseCalls).toHaveLength(0);
  });

  it("leaves the promo alone when payment won the race against the cancel", async () => {
    // A cashier collected payment mid-Cancellation; the discount was earned
    // (ADR-0015), so the Customer is not asked for more afterwards.
    state.order = makeUnpaidOrder();
    state.productRows = [
      { id: 30, qty: 1, product_id: 12, refunded_at: null, cancelled_at: null },
    ];
    state.postCancelStatus = "processing";
    state.postCancelPaymentStatus = "paid";
    state.postCancelTotal = "110000";

    await cancel([{ order_product_id: 30, reason: "customer_request" }]);

    expect(redemption.voidCalls).toHaveLength(0);
    expect(redemption.releaseCalls).toHaveLength(0);
  });

  it("lets the loser of a concurrent cancel fail before touching stock", async () => {
    // Two staff cancel the same Product at once; restocking for the loser
    // would count it back in twice.
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
    // Its money already went back; cancelling would also restock it.
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
