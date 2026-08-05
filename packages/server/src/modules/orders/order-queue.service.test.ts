import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { orderServiceHandlerLogsTable, ordersServicesTable } from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/http-exceptions";
import type { PatchOrderServiceStatusInput } from "@/modules/orders/order-admin.schema";
import { authorizationDouble } from "@/test-support/authorization-double";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// The workshop-floor queue: a worker scans a garment's tag to claim it and start
// work, and staff nudge items between stations from the status dropdown. Two
// invariants live here rather than in the status machine: an item already on a
// colleague's rack cannot be grabbed mid-wash (two people handling one garment
// is how garments get lost), and the terminal exits — picked_up / cancelled /
// refunded — are blocked on this generic endpoint so a garment can only leave
// the shop through the audited pickup, cancel, and refund desks that guard the
// money. The DB is a fake row-lock transaction that captures writes;
// transitionOrderService is stubbed (legality and the photo gate are already
// pinned in order-status-machine.test.ts). The claim/guard logic stays real.
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

// The one transaction handle every test shares: select().for("update") hands
// back whatever row the test locked, and writes are captured for assertions.
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
    // order-queue.service (and order.repository in its import graph) build
    // prepared item-code lookups at module load — without this stub the
    // import itself would dial the database.
    query: {
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
    // The list queries need a live 3-join builder; the guard tests below must
    // short-circuit before ever getting here, so reaching select() is a bug.
    select: () => {
      throw new Error("queue list query reached the database");
    },
  },
}));

const authz = {
  storeIds: [] as number[],
};

mock.module("@/utils/authorization", () => authorizationDouble(authz));

// Spread the real machine and stub only transitionOrderService: which moves are
// legal is order-status-machine.test.ts's job; here we pin only what the queue
// hands it. The actual module is restored in afterAll because that suite runs
// the machine for real.
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

// Sari, ironing staff — the one holding the barcode scanner.
const WORKER = { id: 9, role: "worker" } as unknown as JWTPayload;
const ADMIN = { id: 1, role: "admin" } as unknown as JWTPayload;

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
    // Budi (id 7) claimed this shirt an hour ago and it is mid-wash. Sari's
    // scan must bounce — silently stealing the claim would leave two people
    // working one garment and nobody accountable for it.
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

    // The claim itself: the shirt now belongs to Sari's rack.
    expect(dbState.updates).toEqual([
      { table: ordersServicesTable, values: { handler_id: 9 } },
    ]);
    // The audit row: if the shirt goes missing, this log says who took it
    // off the shelf and that nobody held it before.
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
    // Claim and status flip ride the same row-lock transaction, so a crash
    // can never leave a claimed shirt still marked queued.
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
    // Sari scans the same tag twice (double beep at the shelf). The item is
    // already hers — a second claim row would fake a hand-off in the audit log.
    dbState.lockedRows = [makeLockedRow({ handler_id: 9 })];

    const result = await scan();

    expect(dbState.updates).toEqual([]);
    expect(dbState.inserts).toEqual([]);
    expect(machine.calls).toHaveLength(1);
    expect(result.to_status).toBe("processing");
  });

  it("rejects a scan whose tag belongs to a different order before any write", async () => {
    // The scanned service id exists but hangs off another customer's order —
    // starting work here would process the wrong customer's garment.
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
    // A cashier trying to mark a shirt picked_up from the dropdown would skip
    // the pickup desk's paid-before-pickup check — the garment could walk out
    // unpaid. The gate fires before any transaction so there is no window to
    // race past it.
    const error = await captureRejection(patchStatus({ status: "picked_up" }));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as Error).message).toBe(
      "Use the pickup endpoint to record pickups"
    );
    expect(dbState.transactions).toBe(0);
  });

  it("refuses cancelled and refunded — money-moving exits stay on audited endpoints", async () => {
    // Cancel and refund adjust what the customer owes or gets back; letting
    // the dropdown reach those states would move money with no audit trail.
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
    // QC bounced Budi's ironing job, Budi went home, and Sari picks the redo
    // up from the reject shelf. Restarting the work must move the claim to
    // her — otherwise the redo would still show on Budi's rack.
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
    // Sari sends Budi's finished shirt to quality check for him. Passing an
    // item along is not taking it over — the wash stays credited to Budi.
    dbState.lockedRows = [
      makeLockedRow({ status: "processing", handler_id: 7 }),
    ];
    machine.from = "processing";

    await patchStatus({ status: "quality_check" });

    expect(dbState.updates).toEqual([]);
    expect(dbState.inserts).toEqual([]);
    expect(machine.calls).toHaveLength(1);
  });

  it("trims a whitespace-only cancel note to null before it reaches the transition", async () => {
    // A stray spacebar in the cancel-note box must not persist as a "filled"
    // note — blank means blank. The item is already on Sari's rack, so this
    // claim transition also writes no redundant hand-off log.
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

// Only the pre-query guards are pinned for the two list endpoints; the fake
// db.select throws, so each passing test proves the guard short-circuited
// before the database.
describe("getOrderServiceQueue", () => {
  it("requires admins to pick a store before the queue query runs", async () => {
    // An admin sees every store; an unscoped queue would dump the whole
    // company's floor into one list nobody can work from.
    const error = await captureRejection(getOrderServiceQueue(ADMIN));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Store is required for admin queue access"
    );
  });

  it("hands a worker with no store memberships an empty page, not the company queue", async () => {
    // A just-created account not yet assigned to a branch must see nothing —
    // an empty membership list is not permission to see everything.
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
    // Two supervisors reassigning one garment at the same moment: whoever
    // commits second must log Sari as the previous handler, not the handler the
    // first one saw. Reading it outside the lock forks the trail, and the trail
    // is what the shop follows when an item cannot be found.
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
    // A mistyped order number must not move a garment belonging to someone else.
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
