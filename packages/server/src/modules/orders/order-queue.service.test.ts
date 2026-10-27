import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { orderServiceHandlerLogsTable, ordersServicesTable } from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/http-exceptions";
import type { PatchOrderServiceStatusInput } from "@/modules/orders/order-admin.schema";
import { authorizationDouble } from "@/test-support/authorization-double";
import { captureRejection } from "@/test-support/capture-rejection";
import type { AuthUser } from "@/types";

// A worker scans an Item's tag to claim it. An Item a colleague is handling
// can't be grabbed (two Handlers is how Items get lost), and picked up,
// cancelled and refunded go only through their own audited screens.
type AnyObj = Record<string, unknown>;

interface CapturedWrite {
  table: unknown;
  values: AnyObj;
}

const dbState = {
  lockedRows: [] as AnyObj[],
  transactions: 0,
  updates: [] as CapturedWrite[],
  inserts: [] as CapturedWrite[],
};

const TX = {
  select: () => ({
    from: () => ({
      where: () => ({
        for: () => Promise.resolve(dbState.lockedRows),
      }),
    }),
  }),
  update: (table: unknown) => ({
    set: (values: AnyObj) => ({
      where: () => {
        dbState.updates.push({ table, values });
        return Promise.resolve();
      },
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: AnyObj) => {
      dbState.inserts.push({ table, values });
      return Promise.resolve();
    },
  }),
};

mock.module("@/db", () => ({
  db: {
    // Tag lookups are prepared on import; without these the import itself
    // would reach the database.
    query: {
      itemsTable: {
        findFirst: () => ({
          prepare: () => ({ execute: () => Promise.resolve(undefined) }),
        }),
      },
      ordersServicesTable: {
        findFirst: () => ({
          prepare: () => ({ execute: () => Promise.resolve(undefined) }),
        }),
      },
    },
    transaction: (cb: (tx: typeof TX) => unknown) => {
      dbState.transactions += 1;
      return cb(TX);
    },
    // The guard tests below must stop before the list query runs.
    select: () => {
      throw new Error("queue list query reached the database");
    },
  },
}));

const authz = {
  storeIds: [] as number[],
};

mock.module("@/utils/authorization", () => authorizationDouble(authz));

// Restored in afterAll, since order-status-machine.test.ts runs the real one.
const actualStatusMachine = await import(
  "@/modules/orders/order-status-machine"
);

const machine = {
  calls: [] as Array<{ executor: unknown; input: AnyObj }>,
  from: "queued",
};

mock.module("@/modules/orders/order-status-machine", () => ({
  ...actualStatusMachine,
  transitionOrderService: (executor: unknown, input: AnyObj) => {
    machine.calls.push({ executor, input });
    return Promise.resolve({ from: machine.from, to: input.to });
  },
}));

afterAll(() => {
  mock.module(
    "@/modules/orders/order-status-machine",
    () => actualStatusMachine
  );
});

const {
  getMyOrderServices,
  getOrderServiceQueue,
  startOrderServiceWork,
  updateOrderServiceHandler,
  updateOrderServiceStatus,
} = await import("@/modules/orders/order-queue.service");

// Sari, the cleaner holding the scanner.
const WORKER = { id: 9, role: "worker" } as unknown as AuthUser;
const ADMIN = { id: 1, role: "admin" } as unknown as AuthUser;

const makeLockedRow = (over: AnyObj = {}) => ({
  id: 501,
  order_id: 88,
  status: "queued",
  handler_id: null,
  ...over,
});

beforeEach(() => {
  dbState.lockedRows = [makeLockedRow()];
  dbState.transactions = 0;
  dbState.updates = [];
  dbState.inserts = [];
  machine.calls = [];
  machine.from = "queued";
  authz.storeIds = [];
});

const scan = () =>
  startOrderServiceWork({ orderId: 88, serviceId: 501, user: WORKER });

describe("startOrderServiceWork", () => {
  it("blocks scanning an item already on a colleague's rack", async () => {
    // Budi (id 7) is mid-clean on this Item; Sari's scan must not steal it
    // and leave nobody accountable.
    dbState.lockedRows = [makeLockedRow({ handler_id: 7, status: "queued" })];

    const error = await captureRejection(scan());

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as Error).message).toBe(
      "This item is already assigned to another staff member"
    );
    expect(dbState.updates).toEqual([]);
    expect(dbState.inserts).toEqual([]);
    expect(machine.calls).toEqual([]);
  });

  it("claims an unowned queued item: handler flips to the scanner and the claim is logged", async () => {
    const result = await scan();

    expect(dbState.updates).toEqual([
      { table: ordersServicesTable, values: { handler_id: 9 } },
    ]);
    // If the Item goes missing, this log says who took it off the shelf.
    expect(dbState.inserts).toEqual([
      {
        table: orderServiceHandlerLogsTable,
        values: {
          order_service_id: 501,
          from_handler_id: null,
          to_handler_id: 9,
          changed_by: 9,
          note: "Started from queue",
        },
      },
    ]);
    // One transaction, so a crash never leaves a claimed Item still queued.
    expect(machine.calls).toHaveLength(1);
    expect(machine.calls[0]?.executor).toBe(TX);
    expect(machine.calls[0]?.input).toEqual({
      orderId: 88,
      serviceId: 501,
      to: "processing",
      by: 9,
      note: "Started from queue",
    });
    expect(result).toEqual({
      from_status: "queued",
      handler_id: 9,
      order_service_id: 501,
      to_status: "processing",
    });
  });

  it("re-scanning your own item transitions without rewriting the claim", async () => {
    // A double beep at the shelf must not log a fake hand-off.
    dbState.lockedRows = [makeLockedRow({ handler_id: 9 })];

    const result = await scan();

    expect(dbState.updates).toEqual([]);
    expect(dbState.inserts).toEqual([]);
    expect(machine.calls).toHaveLength(1);
    expect(result.to_status).toBe("processing");
  });

  it("rejects a scan whose tag belongs to a different order before any write", async () => {
    // The OrderService belongs to another Customer's Order.
    dbState.lockedRows = [];

    const error = await captureRejection(scan());

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Order service not found for this order"
    );
    expect(dbState.updates).toEqual([]);
    expect(dbState.inserts).toEqual([]);
    expect(machine.calls).toEqual([]);
  });
});

const patchStatus = (body: PatchOrderServiceStatusInput) =>
  updateOrderServiceStatus({ orderId: 88, serviceId: 501, body, user: WORKER });

describe("updateOrderServiceStatus", () => {
  it("refuses picked_up before even opening a transaction", async () => {
    // Marking picked up from the dropdown would skip the paid-before-pickup
    // check and let an unpaid Item walk out.
    const error = await captureRejection(patchStatus({ status: "picked_up" }));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as Error).message).toBe(
      "Use the pickup endpoint to record pickups"
    );
    expect(dbState.transactions).toBe(0);
  });

  it("refuses cancelled and refunded — money-moving exits stay on audited endpoints", async () => {
    for (const status of ["cancelled", "refunded"] as const) {
      const error = await captureRejection(patchStatus({ status }));
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as Error).message).toBe(
        "Use the cancel or refund endpoint for terminal exit states"
      );
    }
    expect(dbState.transactions).toBe(0);
    expect(machine.calls).toEqual([]);
  });

  it("auto-assigns the acting user when pushing someone else's qc_reject back to processing", async () => {
    // Budi's work got a QC reject and he went home; Sari restarts it, so it
    // must leave Budi's list and become hers.
    dbState.lockedRows = [
      makeLockedRow({ status: "qc_reject", handler_id: 7 }),
    ];
    machine.from = "qc_reject";

    const result = await patchStatus({ status: "processing" });

    expect(dbState.updates).toEqual([
      { table: ordersServicesTable, values: { handler_id: 9 } },
    ]);
    expect(dbState.inserts).toEqual([
      {
        table: orderServiceHandlerLogsTable,
        values: {
          order_service_id: 501,
          from_handler_id: 7,
          to_handler_id: 9,
          changed_by: 9,
          note: "Auto-assigned on status update",
        },
      },
    ]);
    expect(machine.calls).toHaveLength(1);
    expect(machine.calls[0]?.input).toMatchObject({ to: "processing" });
    expect(result).toEqual({
      from_status: "qc_reject",
      order_service_id: 501,
      to_status: "processing",
    });
  });

  it("leaves the handler untouched on a non-claim transition", async () => {
    // Sari sends Budi's finished Item to Waiting QC; the work stays Budi's.
    dbState.lockedRows = [
      makeLockedRow({ status: "processing", handler_id: 7 }),
    ];
    machine.from = "processing";

    await patchStatus({ status: "waiting_qc" });

    expect(dbState.updates).toEqual([]);
    expect(dbState.inserts).toEqual([]);
    expect(machine.calls).toHaveLength(1);
  });

  it("trims a whitespace-only cancel note to null before it reaches the transition", async () => {
    dbState.lockedRows = [makeLockedRow({ status: "queued", handler_id: 9 })];

    await patchStatus({ status: "processing", cancel_note: "   " });

    expect(machine.calls).toHaveLength(1);
    expect(machine.calls[0]?.input).toMatchObject({
      to: "processing",
      cancelNote: null,
    });
    expect(dbState.updates).toEqual([]);
    expect(dbState.inserts).toEqual([]);
  });
});

describe("getOrderServiceQueue", () => {
  it("requires admins to pick a store before the queue query runs", async () => {
    // An unscoped Queue would mix every Store into one list nobody can work.
    const error = await captureRejection(getOrderServiceQueue(ADMIN));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Store is required for admin queue access"
    );
  });

  it("hands a worker with no store memberships an empty page, not the company queue", async () => {
    // A new User with no Store yet sees nothing, not everything.
    authz.storeIds = [];

    const result = await getOrderServiceQueue(WORKER);

    expect(result).toEqual({
      items: [],
      meta: { limit: 25, offset: 0, total: 0 },
    });
  });
});

describe("updateOrderServiceHandler", () => {
  it("records the handler it took the garment from under the same lock it writes", async () => {
    // Two admins reassign one Item at once; the second must log the real
    // previous Handler, since the trail is how a lost Item is found.
    dbState.lockedRows = [
      makeLockedRow({ handler_id: 9, status: "processing" }),
    ];

    const result = await updateOrderServiceHandler({
      body: { handler_id: 11, note: "Sari went home" },
      orderId: 88,
      serviceId: 501,
      user: ADMIN,
    });

    expect(result).toEqual({ handler_id: 11, order_service_id: 501 });
    expect(dbState.transactions).toBe(1);
    expect(dbState.updates).toEqual([
      { table: ordersServicesTable, values: { handler_id: 11 } },
    ]);
    expect(dbState.inserts).toEqual([
      {
        table: orderServiceHandlerLogsTable,
        values: {
          changed_by: 1,
          from_handler_id: 9,
          note: "Sari went home",
          order_service_id: 501,
          to_handler_id: 11,
        },
      },
    ]);
  });

  it("refuses a reassignment for a garment that is not on this order", async () => {
    dbState.lockedRows = [];

    const error = await captureRejection(
      updateOrderServiceHandler({
        body: { handler_id: 11, note: "wrong order" },
        orderId: 88,
        serviceId: 501,
        user: ADMIN,
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(dbState.updates).toEqual([]);
    expect(dbState.inserts).toEqual([]);
  });
});

describe("getMyOrderServices", () => {
  it("hands a worker with no store memberships an empty rack list", async () => {
    authz.storeIds = [];

    const result = await getMyOrderServices(WORKER, {
      include_terminal: false,
    });

    expect(result).toEqual([]);
  });
});
