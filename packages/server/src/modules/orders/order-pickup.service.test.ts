import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// The pickup desk handover: a customer reads out the receipt's 6-digit pickup
// code, the cashier photographs the objects leaving the counter, and only then
// do the selected Items flip to picked_up. These tests pin the desk's hard
// gates — full payment before anything leaves (ADR-0009), the per-order pickup
// code as proof the person at the counter placed this order (ADR-0005) — plus
// the one-transaction guarantee that a concurrent double-pickup rolls the
// photographed event back out. The cashier chooses objects, never treatments.
// The DB and S3 (presign/optimize/CDN URL) are doubled; the permission check,
// every gate in between, and the status machine itself stay real — so the
// whole-object rule is genuinely exercised through the desk here as well as
// unit-pinned in order-status-machine.test.ts.

type AnyObj = Record<string, unknown>;

interface CandidateItem {
  id: number;
  item_code: string;
  services: { id: number; status: string }[];
}

const EVENT_ID = 77;

const state = {
  order: undefined as AnyObj | undefined,
  items: [] as CandidateItem[],
  // undefined → the flip succeeds for every requested id (no concurrent race)
  flippedIds: undefined as number[] | undefined,
  // captured reads/writes
  orderReads: [] as AnyObj[],
  itemReads: [] as AnyObj[],
  insertedEvent: undefined as AnyObj | undefined,
  statusLogs: [] as AnyObj[],
  transactionOutcome: undefined as "committed" | "rolled_back" | undefined,
};

const s3Calls = {
  presigned: [] as { contentType: string; key: string }[],
  optimized: [] as string[],
};

// Sentinel transaction handle. The REAL status machine runs against it, so the
// whole-object rule is exercised here rather than doubled away — and the flip
// provably runs on the same transaction as the event insert, which is what
// makes the rollback guarantee real.
const TX = {
  query: {
    itemsTable: {
      findMany: (args: AnyObj) => {
        state.itemReads.push(args);
        return Promise.resolve(
          state.items.filter((item) =>
            (args.where as { id: { in: number[] } }).id.in.includes(item.id)
          )
        );
      },
    },
    // The rollup after the flip re-reads the order; nothing here asserts on it.
    ordersServicesTable: { findMany: () => Promise.resolve([]) },
    ordersProductsTable: { findMany: () => Promise.resolve([]) },
  },
  insert: () => ({
    values: (values: AnyObj | AnyObj[]) => {
      if (Array.isArray(values)) {
        state.statusLogs.push(...values);
        return Promise.resolve();
      }
      state.insertedEvent = values;
      return Object.assign(Promise.resolve(), {
        // id + picked_up_at are DB defaults the real insert hands back.
        returning: () =>
          Promise.resolve([{ id: EVENT_ID, picked_up_at: new Date() }]),
      });
    },
  }),
  update: () => ({
    set: () => ({
      where: () =>
        Object.assign(Promise.resolve(), {
          returning: () =>
            Promise.resolve(
              (state.flippedIds ?? readyServiceIds()).map((id) => ({ id }))
            ),
        }),
    }),
  }),
};

// What the guarded UPDATE would win: every treatment already on the shelf.
const readyServiceIds = () =>
  state.items.flatMap((item) =>
    item.services
      .filter((service) => service.status === "ready_for_pickup")
      .map((service) => service.id)
  );

mock.module("@/db", () => ({
  db: {
    query: {
      ordersTable: {
        findFirst: (args: AnyObj) => {
          state.orderReads.push(args);
          return Promise.resolve(state.order);
        },
      },
      itemsTable: {
        findMany: (args: AnyObj) => {
          state.itemReads.push(args);
          return Promise.resolve(state.items);
        },
      },
    },
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      try {
        const result = await cb(TX);
        state.transactionOutcome = "committed";
        return result;
      } catch (error) {
        state.transactionOutcome = "rolled_back";
        throw error;
      }
    },
  },
}));

// Dev and production file into the same bucket under their own prefix, so every key the desk
// issues or accepts carries one. Pinned rather than derived: what these tests care about is that
// the presign and the image-path gate agree on it.
const STORAGE_ENV_PREFIX = "dev/";

mock.module("@/utils/s3", () => ({
  STORAGE_ENV_PREFIX,
  buildMediaUrl: (path: string) => `https://cdn.test/${path}`,
  createPresignedUploadUrl: (input: { contentType: string; key: string }) => {
    s3Calls.presigned.push(input);
    return {
      upload_url: `https://s3.test/${input.key}`,
      key: input.key,
      expires_in_seconds: 300,
    };
  },
  optimizeUploadedImage: (key: string) => {
    s3Calls.optimized.push(key);
    return Promise.resolve();
  },
}));

const { createOrderPickupEvent, createOrderPickupEventPresign } = await import(
  "@/modules/orders/order-pickup.service"
);

const ORDER_ID = 42;

// A cashier passes assertCanProcessPickup (kept real; roles are pinned in
// permissions.test.ts) without the can_process_pickup override flag.
const CASHIER = {
  id: 8,
  role: "cashier",
  can_process_pickup: false,
} as unknown as JWTPayload;

const makeOrder = (over: AnyObj = {}) => ({
  id: ORDER_ID,
  pickup_code: "483920",
  payment_status: "paid",
  ...over,
});

const pickup = (body: AnyObj = {}) =>
  createOrderPickupEvent({
    orderId: ORDER_ID,
    body: {
      image_path: `${STORAGE_ENV_PREFIX}orders/${ORDER_ID}/pickup/proof.webp`,
      pickup_code: "483920",
      item_ids: [1, 2],
      ...body,
    } as never,
    user: CASHIER,
  });

const presign = () =>
  createOrderPickupEventPresign({
    orderId: ORDER_ID,
    body: { content_type: "image/jpeg" } as never,
    user: CASHIER,
  });

beforeEach(() => {
  state.order = makeOrder();
  // Two objects on the shelf, one finished treatment each — the ordinary
  // two-bag collection.
  state.items = [
    {
      id: 1,
      item_code: "ORD-042-S001",
      services: [{ id: 5, status: "ready_for_pickup" }],
    },
    {
      id: 2,
      item_code: "ORD-042-S002",
      services: [{ id: 6, status: "ready_for_pickup" }],
    },
  ];
  state.flippedIds = undefined;
  state.orderReads = [];
  state.itemReads = [];
  state.insertedEvent = undefined;
  state.statusLogs = [];
  state.transactionOutcome = undefined;
  s3Calls.presigned = [];
  s3Calls.optimized = [];
});

describe("createOrderPickupEventPresign", () => {
  it("refuses to open the camera while money is still owed", async () => {
    // ADR-0009: a half-paid customer at the counter gets sent to the till, not
    // a photo slot — no upload URL may exist for garments that cannot leave.
    state.order = makeOrder({ payment_status: "partial" });
    const error = await captureRejection(presign());
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Order must be paid before pickup");
    expect(s3Calls.presigned).toHaveLength(0);
  });

  it("issues an upload slot inside this order's own pickup folder", async () => {
    // The folder prefix is what the image-path gate later trusts, so a proof
    // photo can never be filed under another customer's order.
    const result = await presign();
    expect(s3Calls.presigned).toHaveLength(1);
    expect(s3Calls.presigned[0].contentType).toBe("image/jpeg");
    expect(s3Calls.presigned[0].key).toStartWith(
      `${STORAGE_ENV_PREFIX}orders/${ORDER_ID}/pickup/`
    );
    expect(result.key).toStartWith(
      `${STORAGE_ENV_PREFIX}orders/${ORDER_ID}/pickup/`
    );
  });
});

describe("createOrderPickupEvent", () => {
  it("keeps garments behind the counter until the order is fully paid", async () => {
    // ADR-0009: paid-before-pickup outranks everything else — even a wrong
    // pickup code reports the money problem first, and nothing is written.
    state.order = makeOrder({ payment_status: "partial" });
    const error = await captureRejection(pickup({ pickup_code: "483921" }));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Order must be paid before pickup");
    expect(state.transactionOutcome).toBeUndefined();
    expect(state.insertedEvent).toBeUndefined();
    expect(s3Calls.optimized).toHaveLength(0);
  });

  it("rejects a pickup code that does not match this order's receipt", async () => {
    // ADR-0005: the code proves the person at the counter placed this order.
    // One digit off on a paid order still hands nothing over.
    const error = await captureRejection(pickup({ pickup_code: "483921" }));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Invalid pickup code");
    expect(state.transactionOutcome).toBeUndefined();
    expect(s3Calls.optimized).toHaveLength(0);
  });

  it("collapses a double-tapped tag so one object is only handed over once", async () => {
    // The UI can send the same object twice on a double-tap; the desk must
    // treat it as one everywhere — validation, the flip, and the receipt.
    const result = await pickup({ item_ids: [1, 1, 2] });
    expect(state.itemReads[0].where).toEqual({
      order_id: ORDER_ID,
      id: { in: [1, 2] },
    });
    expect(result.item_ids).toEqual([1, 2]);
    expect(result.service_ids).toEqual([5, 6]);
  });

  it("rejects a handover with nothing selected before touching the database", async () => {
    const error = await captureRejection(pickup({ item_ids: [] }));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "At least one item must be picked up"
    );
    expect(state.orderReads).toHaveLength(0);
    expect(state.itemReads).toHaveLength(0);
  });

  it("rejects a proof photo filed under another order's folder", async () => {
    // The photo is the evidence of what left for THIS order — pointing at
    // order 99's folder would let one photo vouch for two handovers.
    const error = await captureRejection(
      pickup({ image_path: `${STORAGE_ENV_PREFIX}orders/99/pickup/x.jpg` })
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Invalid image path");
    expect(s3Calls.optimized).toHaveLength(0);
    expect(state.transactionOutcome).toBeUndefined();
  });

  it("rolls the pickup event back when another cashier beat this one to an item", async () => {
    // Two counters serve the same order at once: the second flip comes up
    // short. The event row already inserted in this transaction must vanish
    // with the rollback, or the shop keeps a photo of a handover that never
    // happened.
    state.flippedIds = [5];
    const error = await captureRejection(pickup({ item_ids: [1, 2] }));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Another cashier already processed one of the selected items. Refresh and try again."
    );
    expect(state.insertedEvent).toBeDefined();
    expect(state.transactionOutcome).toBe("rolled_back");
  });

  it("records the handover: photo optimized, event linked to the flip, receipt returned", async () => {
    const result = await pickup();

    expect(s3Calls.optimized).toEqual([
      `${STORAGE_ENV_PREFIX}orders/${ORDER_ID}/pickup/proof.webp`,
    ]);
    expect(state.insertedEvent).toEqual({
      order_id: ORDER_ID,
      image_path: `${STORAGE_ENV_PREFIX}orders/${ORDER_ID}/pickup/proof.webp`,
      picked_up_by: 8,
    });
    // The flip ran on the same transaction as the event insert — the object
    // resolution happened against TX, not the outer db handle.
    expect(state.itemReads).toHaveLength(1);
    // One status-log row per treatment that actually left the shop.
    expect(state.statusLogs.map((log) => log.order_service_id)).toEqual([5, 6]);
    expect(state.transactionOutcome).toBe("committed");

    expect(result.id).toBe(EVENT_ID);
    expect(result.image_url).toBe(
      `https://cdn.test/${STORAGE_ENV_PREFIX}orders/${ORDER_ID}/pickup/proof.webp`
    );
    expect(result.order_id).toBe(ORDER_ID);
    expect(result.picked_up_at).toBeInstanceOf(Date);
    expect(result.service_ids).toEqual([5, 6]);
  });
});
