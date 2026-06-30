import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestException, NotFoundException } from "@/errors";
import { normalizeComplaintListQuery } from "@/modules/complaints/complaint.schema";
import type { JWTPayload } from "@/types";

// The service takes its DB handle as a parameter on every repository call, so a
// set of in-memory doubles exercises the full orchestration (gates, rework-line
// construction) without a database. Tests mutate `repo`/`rollup`/`authz` to
// drive each branch and capture what the service wrote.
type AnyObj = Record<string, unknown>;

const repo = {
  subject: undefined as AnyObj | undefined,
  existingComplaint: undefined as AnyObj | undefined,
  complaintById: undefined as AnyObj | undefined,
  reworkCount: 0,
  // captured writes
  insertedComplaint: undefined as AnyObj | undefined,
  insertedRework: undefined as AnyObj | undefined,
};

const rollup = {
  calls: [] as Array<{ executor: unknown; orderId: number; userId: number }>,
};

const authz = {
  assertCalls: [] as Array<{ userId: number; storeId: number }>,
  storeIds: [] as number[],
};

// Sentinel transaction handle: db.transaction(cb) runs cb(TX); repository
// doubles ignore the executor, so we only assert it is threaded through.
const TX = { __tx: true };

mock.module("@/db", () => ({
  db: {
    transaction: (cb: (tx: unknown) => unknown) => cb(TX),
  },
}));

// Spread the real module so the only export we change is recomputeOrderRollup.
// transitionOrderService calls recompute via its in-module binding (not this
// export object), so order-status-machine.test.ts is unaffected by the stub.
const actualStatusMachine = await import(
  "@/modules/orders/order-status-machine"
);

mock.module("@/modules/orders/order-status-machine", () => ({
  ...actualStatusMachine,
  recomputeOrderRollup: (
    executor: unknown,
    orderId: number,
    userId: number
  ) => {
    rollup.calls.push({ executor, orderId, userId });
    return Promise.resolve();
  },
}));

mock.module("@/utils/authorization", () => ({
  assertStoreAccess: (user: { id: number }, storeId: number) => {
    authz.assertCalls.push({ userId: user.id, storeId });
    return Promise.resolve();
  },
  getUserStoreIds: () => Promise.resolve(authz.storeIds),
}));

mock.module("@/modules/complaints/complaint.repository", () => ({
  findComplaintSubjectService: () => Promise.resolve(repo.subject),
  findComplaintForService: () => Promise.resolve(repo.existingComplaint),
  findComplaintById: () => Promise.resolve(repo.complaintById),
  countReworkLinesForOrder: () => Promise.resolve(repo.reworkCount),
  insertComplaint: (_executor: unknown, values: AnyObj) => {
    repo.insertedComplaint = values;
    return Promise.resolve({ id: 99, ...values });
  },
  insertReworkLine: (_executor: unknown, values: AnyObj) => {
    repo.insertedRework = values;
    return Promise.resolve({ id: 500, ...values });
  },
  findComplaintDetailById: () => Promise.resolve(undefined),
  findComplaints: () => Promise.resolve({ items: [], total: 0 }),
}));

const { addRework, openComplaint } = await import(
  "@/modules/complaints/complaint.service"
);

const USER = { id: 42, role: "cashier" } as unknown as JWTPayload;

const makeSubject = (over: AnyObj = {}) => ({
  id: 10,
  status: "picked_up",
  complaint_id: null,
  service_id: 3,
  brand: "Nike",
  color: "white",
  model: "AirMax",
  size: "42",
  order: { id: 7, code: "ORD-001", store_id: 1 },
  ...over,
});

const captureRejection = async (
  promise: Promise<unknown>
): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject, but it resolved");
};

beforeEach(() => {
  repo.subject = makeSubject();
  repo.existingComplaint = undefined;
  repo.complaintById = undefined;
  repo.reworkCount = 0;
  repo.insertedComplaint = undefined;
  repo.insertedRework = undefined;
  rollup.calls = [];
  authz.assertCalls = [];
  authz.storeIds = [];
});

const open = (body: AnyObj = {}) =>
  openComplaint({
    user: USER,
    body: {
      order_service_id: 10,
      reason: "Still dirty",
      start_rework: false,
      ...body,
    } as never,
  });

describe("openComplaint", () => {
  it("rejects when the order service is not found", async () => {
    repo.subject = undefined;
    const error = await captureRejection(open());
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe("Order service not found");
  });

  it("rejects a complaint on an item that is not picked_up", async () => {
    repo.subject = makeSubject({ status: "ready_for_pickup" });
    const error = await captureRejection(open());
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Complaints can only be opened on picked-up items"
    );
  });

  it("rejects opening a complaint on a rework line", async () => {
    repo.subject = makeSubject({ complaint_id: 5 });
    const error = await captureRejection(open());
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Cannot open a complaint on a rework line"
    );
  });

  it("rejects when a complaint already exists for the item", async () => {
    repo.existingComplaint = { id: 5 };
    const error = await captureRejection(open());
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "A complaint already exists for this item"
    );
  });

  it("checks store access against the subject's store", async () => {
    await open();
    expect(authz.assertCalls).toEqual([{ userId: 42, storeId: 1 }]);
  });

  it("opens a complaint without a rework when start_rework is false", async () => {
    const result = await open({ start_rework: false });

    expect(result.complaint.id).toBe(99);
    expect(result.rework).toBeNull();
    expect(repo.insertedRework).toBeUndefined();
    expect(rollup.calls).toHaveLength(0);
    expect(repo.insertedComplaint).toEqual({
      order_service_id: 10,
      reason: "Still dirty",
      opened_by: 42,
    });
  });

  it("spawns a free rework line on the same order when start_rework is true", async () => {
    const result = await open({ start_rework: true });

    expect(result.rework).not.toBeNull();
    // Rework is a free, priority, queued line carrying complaint_id, on the
    // ORIGINAL order, copying the complained item's attributes (ADR-0013).
    expect(repo.insertedRework).toMatchObject({
      order_id: 7,
      service_id: 3,
      brand: "Nike",
      color: "white",
      model: "AirMax",
      size: "42",
      price: "0",
      cogs_snapshot: "0",
      is_priority: true,
      status: "queued",
      complaint_id: 99,
      item_code: "ORD-001-RW001",
    });
  });

  it("recomputes the order rollup inside the transaction after a rework", async () => {
    await open({ start_rework: true });
    expect(rollup.calls).toEqual([{ executor: TX, orderId: 7, userId: 42 }]);
  });

  it("numbers rework lines sequentially per order, zero-padded to 3", async () => {
    repo.reworkCount = 2;
    await open({ start_rework: true });
    expect(repo.insertedRework?.item_code).toBe("ORD-001-RW003");
  });
});

describe("addRework", () => {
  const add = () => addRework({ user: USER, complaintId: 99 });

  it("rejects when the complaint is not found", async () => {
    repo.complaintById = undefined;
    const error = await captureRejection(add());
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe("Complaint not found");
  });

  it("rejects when the original line is no longer picked_up", async () => {
    repo.complaintById = { id: 99, order_service_id: 10 };
    repo.subject = makeSubject({ status: "refunded" });
    const error = await captureRejection(add());
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Cannot add a rework once the original line is no longer picked up"
    );
  });

  it("adds a sequential rework line to the complaint", async () => {
    repo.complaintById = { id: 99, order_service_id: 10 };
    repo.reworkCount = 1;

    const line = await add();

    expect(line.id).toBe(500);
    expect(repo.insertedRework).toMatchObject({
      complaint_id: 99,
      price: "0",
      is_priority: true,
      status: "queued",
      item_code: "ORD-001-RW002",
    });
    expect(rollup.calls).toEqual([{ executor: TX, orderId: 7, userId: 42 }]);
  });
});

describe("normalizeComplaintListQuery", () => {
  it("applies default pagination when no query is given", () => {
    expect(normalizeComplaintListQuery()).toEqual({
      limit: 25,
      offset: 0,
      search: undefined,
      store_id: undefined,
    });
  });

  it("passes through store_id and search filters", () => {
    expect(
      normalizeComplaintListQuery({
        limit: 10,
        offset: 20,
        store_id: 3,
        search: "ORD-001",
      })
    ).toEqual({
      limit: 10,
      offset: 20,
      store_id: 3,
      search: "ORD-001",
    });
  });

  it("clamps an over-max limit to MAX_PAGE_SIZE", () => {
    expect(normalizeComplaintListQuery({ limit: 9999 }).limit).toBe(100);
  });
});
