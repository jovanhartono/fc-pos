import { describe, expect, it } from "bun:test";
import { is, SQL } from "drizzle-orm";
import { orderServiceStatusEnum } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import {
  billableOrderTotal,
  completePickup,
  type DbExecutor,
  deriveItemStatus,
  deriveOrderStatus,
  type ItemStatusLine,
  isHandedOverByPickup,
  isItemCollectable,
  isTerminalOrderServiceStatus,
  nextReadyAt,
  ORDER_SERVICE_TRANSITIONS,
  ORDER_TERMINAL_SERVICE_STATUSES,
  type OrderServiceStatus,
  summarizeOrderFulfillment,
  transitionOrderService,
} from "@/modules/orders/order-status-machine";

interface AnyLine extends ItemStatusLine {
  id: number;
}

const s = (status: OrderServiceStatus) => ({ status });

const PICKUP_EVENT = 9;

// pickup_event_id set = this OrderService left the shop on that handover;
// null = the Item is still here.
const t = (
  status: OrderServiceStatus,
  pickup_event_id: number | null = null
) => ({ pickup_event_id, status });
const p = (cancelled = false) => ({
  cancelled_at: cancelled ? new Date() : null,
});

describe("deriveOrderStatus", () => {
  it("returns 'created' when there are no services and no products", () => {
    expect(deriveOrderStatus([], [])).toBe("created");
  });

  it("returns 'completed' when there are no services but a live product exists", () => {
    expect(deriveOrderStatus([], [p()])).toBe("completed");
  });

  it("returns 'cancelled' for a products-only order with every product cancelled", () => {
    expect(deriveOrderStatus([], [p(true)])).toBe("cancelled");
    expect(deriveOrderStatus([], [p(true), p(true)])).toBe("cancelled");
  });

  it("returns 'completed' for a products-only order with a partial cancel", () => {
    expect(deriveOrderStatus([], [p(true), p()])).toBe("completed");
  });

  it("treats a refunded (not cancelled) product as real activity -> 'completed'", () => {
    expect(deriveOrderStatus([], [p()])).toBe("completed");
  });

  it("returns 'cancelled' when every line (service and product) is cancelled", () => {
    expect(deriveOrderStatus([s("cancelled"), s("cancelled")], [])).toBe(
      "cancelled"
    );
    expect(deriveOrderStatus([s("cancelled")], [p(true)])).toBe("cancelled");
  });

  it("returns 'completed' when a service is cancelled but a product line is live", () => {
    expect(deriveOrderStatus([s("cancelled")], [p()])).toBe("completed");
  });

  it("returns 'completed' when all services are terminal and at least one was delivered", () => {
    expect(deriveOrderStatus([s("picked_up"), s("cancelled")], [])).toBe(
      "completed"
    );
    expect(deriveOrderStatus([s("refunded"), s("cancelled")], [])).toBe(
      "completed"
    );
    expect(deriveOrderStatus([s("picked_up")], [])).toBe("completed");
  });

  it("returns 'ready_for_pickup' when every active service is ready", () => {
    expect(
      deriveOrderStatus([s("ready_for_pickup"), s("ready_for_pickup")], [])
    ).toBe("ready_for_pickup");
  });

  it("stays 'created' when the only non-queued line was cancelled at the counter", () => {
    // A Cancellation before any work is not progress; reading it as such tells
    // the Customer the shop is cleaning an Item nobody has touched.
    expect(deriveOrderStatus([s("cancelled"), s("queued")], [])).toBe(
      "created"
    );
    expect(
      deriveOrderStatus([s("cancelled"), s("cancelled"), s("queued")], [])
    ).toBe("created");
  });

  it("returns 'processing' when a line was delivered and the rest are queued", () => {
    // Unlike a Cancellation, a picked-up or refunded Line is real progress.
    expect(deriveOrderStatus([s("picked_up"), s("queued")], [])).toBe(
      "processing"
    );
    expect(deriveOrderStatus([s("refunded"), s("queued")], [])).toBe(
      "processing"
    );
  });

  it("returns 'ready_for_pickup' (partial pickup state) when picked-up co-exists with ready services", () => {
    expect(deriveOrderStatus([s("picked_up"), s("ready_for_pickup")], [])).toBe(
      "ready_for_pickup"
    );
  });

  it("ignores product lines while services are still active", () => {
    expect(deriveOrderStatus([s("queued"), s("processing")], [p(true)])).toBe(
      "processing"
    );
    expect(deriveOrderStatus([s("quality_check")], [])).toBe("processing");
    expect(deriveOrderStatus([s("qc_reject")], [])).toBe("processing");
  });

  it("returns 'created' when every service is queued", () => {
    expect(deriveOrderStatus([s("queued"), s("queued")], [])).toBe("created");
  });
});

// ADR-0017: an Item has no status column; it is read off its OrderServices.
describe("deriveItemStatus", () => {
  it("reads as queued while the pair is still waiting to be started", () => {
    expect(deriveItemStatus([t("queued"), t("queued")])).toBe("queued");
  });

  it("reads as processing the moment any one treatment is under way", () => {
    // The Item is in the workshop once any one of its OrderServices starts.
    expect(deriveItemStatus([t("queued"), t("processing"), t("queued")])).toBe(
      "processing"
    );
    expect(deriveItemStatus([t("queued"), t("quality_check")])).toBe(
      "processing"
    );
  });

  it("reaches the shelf only when every live treatment is finished", () => {
    expect(
      deriveItemStatus([t("ready_for_pickup"), t("ready_for_pickup")])
    ).toBe("ready_for_pickup");
    expect(deriveItemStatus([t("ready_for_pickup"), t("processing")])).toBe(
      "processing"
    );
  });

  it("ignores a cancelled sibling when the rest are done", () => {
    expect(deriveItemStatus([t("ready_for_pickup"), t("cancelled")])).toBe(
      "ready_for_pickup"
    );
  });

  it("still reads as queued when a cancelled treatment is the only thing that moved", () => {
    // The Customer sees this on /track; "processing" would promise work
    // nobody has started.
    expect(deriveItemStatus([t("cancelled"), t("queued")])).toBe("queued");
  });

  it("reads as picked_up once the object has actually gone out the door", () => {
    expect(deriveItemStatus([t("picked_up", PICKUP_EVENT)])).toBe("picked_up");
    expect(
      deriveItemStatus([t("picked_up", PICKUP_EVENT), t("refunded")])
    ).toBe("picked_up");
    // Collected, then refunded: it still points at the handover that took it.
    expect(
      deriveItemStatus([t("refunded", PICKUP_EVENT), t("cancelled")])
    ).toBe("picked_up");
  });

  it("reads as refunded when the money went back but the pair never did", () => {
    // Refunded while queued: the Order reads completed, but the Item is still
    // here, and /track must not tell the Customer they have it.
    expect(deriveItemStatus([t("refunded")])).toBe("refunded");
    expect(deriveItemStatus([t("refunded"), t("cancelled")])).toBe("refunded");
  });

  it("reads as cancelled only when the whole object was called off", () => {
    expect(deriveItemStatus([t("cancelled"), t("cancelled")])).toBe(
      "cancelled"
    );
  });
});

describe("isItemCollectable", () => {
  it("lets an object go when every live treatment on it is ready", () => {
    expect(
      isItemCollectable([t("ready_for_pickup"), t("ready_for_pickup")])
    ).toBe(true);
    expect(isItemCollectable([t("ready_for_pickup"), t("cancelled")])).toBe(
      true
    );
  });

  it("lets a refunded pair go home even though nothing was done to it", () => {
    // A Refund settles the money, not the Item; otherwise nothing could ever
    // turn ready and it would sit on the shelf for good.
    expect(isItemCollectable([t("refunded")])).toBe(true);
    expect(isItemCollectable([t("refunded"), t("cancelled")])).toBe(true);
  });

  it("holds it back while any treatment is still live and unfinished", () => {
    expect(isItemCollectable([t("ready_for_pickup"), t("processing")])).toBe(
      false
    );
    expect(isItemCollectable([t("queued")])).toBe(false);
  });

  it("refuses an object with nothing left to hand over", () => {
    // Re-scanning a collected Item's tag must not record a second handover.
    expect(isItemCollectable([t("picked_up", PICKUP_EVENT)])).toBe(false);
    expect(isItemCollectable([t("refunded", PICKUP_EVENT)])).toBe(false);
    expect(isItemCollectable([])).toBe(false);
  });
});

describe("ORDER_SERVICE_TRANSITIONS", () => {
  it("declares an entry for every orderServiceStatusEnum value", () => {
    for (const value of orderServiceStatusEnum.enumValues) {
      expect(ORDER_SERVICE_TRANSITIONS).toHaveProperty(value);
    }
  });

  it("makes refund reachable from every non-terminal status (ADR-0004)", () => {
    const nonTerminals: OrderServiceStatus[] = [
      "queued",
      "processing",
      "quality_check",
      "qc_reject",
      "ready_for_pickup",
    ];
    for (const status of nonTerminals) {
      expect(ORDER_SERVICE_TRANSITIONS[status]).toContain("refunded");
    }
  });

  it("makes refund reachable from picked_up (refund-after-pickup, ADR-0004)", () => {
    expect(ORDER_SERVICE_TRANSITIONS.picked_up).toContain("refunded");
  });

  it("forces QC redo through qc_reject (no direct quality_check -> processing)", () => {
    expect(ORDER_SERVICE_TRANSITIONS.quality_check).not.toContain("processing");
    expect(ORDER_SERVICE_TRANSITIONS.quality_check).toContain("qc_reject");
    expect(ORDER_SERVICE_TRANSITIONS.qc_reject).toContain("processing");
  });

  it("makes refunded and cancelled fully terminal", () => {
    expect(ORDER_SERVICE_TRANSITIONS.refunded).toEqual([]);
    expect(ORDER_SERVICE_TRANSITIONS.cancelled).toEqual([]);
  });

  it("makes picked_up only reachable from ready_for_pickup", () => {
    expect(ORDER_SERVICE_TRANSITIONS.ready_for_pickup).toContain("picked_up");
    const others: OrderServiceStatus[] = [
      "queued",
      "processing",
      "quality_check",
      "qc_reject",
    ];
    for (const status of others) {
      expect(ORDER_SERVICE_TRANSITIONS[status]).not.toContain("picked_up");
    }
  });
});

describe("isTerminalOrderServiceStatus", () => {
  it("treats picked_up, refunded, and cancelled as terminal", () => {
    for (const status of ORDER_TERMINAL_SERVICE_STATUSES) {
      expect(isTerminalOrderServiceStatus(status)).toBe(true);
    }
  });

  it("treats active statuses as non-terminal", () => {
    const active: OrderServiceStatus[] = [
      "queued",
      "processing",
      "quality_check",
      "qc_reject",
      "ready_for_pickup",
    ];
    for (const status of active) {
      expect(isTerminalOrderServiceStatus(status)).toBe(false);
    }
  });
});

// Item photos belong to the Item (ADR-0019); reworkOpenedAt makes the line a
// Rework line of a Complaint opened at that moment.
const makeExecutor = ({
  serviceStatus,
  photosAt = [],
  reworkOpenedAt = null,
}: {
  serviceStatus: OrderServiceStatus;
  photosAt?: Date[];
  reworkOpenedAt?: Date | null;
}) =>
  ({
    query: {
      ordersServicesTable: {
        findFirst: () =>
          Promise.resolve({
            id: 1,
            status: serviceStatus,
            item_id: 7,
            complaint_id: reworkOpenedAt ? 99 : null,
          }),
        findMany: () =>
          Promise.resolve([{ status: "processing" as OrderServiceStatus }]),
      },
      itemImagesTable: {
        findMany: () =>
          Promise.resolve(photosAt.map((created_at) => ({ created_at }))),
      },
      complaintsTable: {
        findFirst: () => Promise.resolve({ created_at: reworkOpenedAt }),
      },
      orderServiceStatusLogsTable: {
        findFirst: () => Promise.resolve(undefined),
      },
      ordersProductsTable: {
        findMany: () => Promise.resolve([]),
      },
    },
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }),
      }),
    }),
    insert: () => ({ values: () => Promise.resolve() }),
  }) as unknown as DbExecutor;

const transitionTo = (executor: DbExecutor, to: OrderServiceStatus) =>
  transitionOrderService(executor, { orderId: 1, serviceId: 1, to, by: 1 });

// Pickup hands over whole Items. Set `flipped` short to stand in for another
// cashier getting there first.
const makePickupExecutor = ({
  items,
  flipped,
  calls = [],
}: {
  items: { id: number; item_code: string; services: AnyLine[] }[];
  flipped?: number[];
  calls?: string[];
}) => {
  const handedOver = items
    .flatMap((item) => item.services)
    .filter(isHandedOverByPickup);
  const readyIds = handedOver
    .filter((service) => service.status === "ready_for_pickup")
    .map((service) => service.id);
  const stampIds = handedOver
    .filter((service) => service.status !== "ready_for_pickup")
    .map((service) => service.id);

  return {
    query: {
      itemsTable: {
        findMany: () => {
          calls.push("read items");
          return Promise.resolve(items);
        },
      },
      ordersServicesTable: { findMany: () => Promise.resolve([]) },
      ordersProductsTable: { findMany: () => Promise.resolve([]) },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            for: () => {
              calls.push("lock lines");
              return Promise.resolve([]);
            },
          }),
        }),
      }),
    }),
    // A status in the SET marks the status update, else it is the event stamp.
    update: () => ({
      set: (values: { status?: OrderServiceStatus }) => ({
        where: () => ({
          returning: () =>
            Promise.resolve(
              (values.status ? (flipped ?? readyIds) : stampIds).map((id) => ({
                id,
              }))
            ),
        }),
      }),
    }),
    insert: () => ({ values: () => Promise.resolve() }),
  } as unknown as DbExecutor;
};

const pickUp = (executor: DbExecutor, itemIds: number[]) =>
  completePickup(executor, {
    orderId: 1,
    itemIds,
    pickupEventId: 9,
    by: 1,
  });

describe("completePickup (ADR-0017: whole objects only)", () => {
  it("holds the object's lines before judging whether it can go", async () => {
    // Another cashier may be adding a Rework line to this Item at the counter.
    const calls: string[] = [];
    const executor = makePickupExecutor({
      calls,
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [{ id: 5, ...t("ready_for_pickup") }],
        },
      ],
    });
    await pickUp(executor, [1]);
    expect(calls).toEqual(["lock lines", "read items"]);
  });

  it("flips every finished treatment on the object, not a chosen subset", async () => {
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [
            { id: 5, ...t("ready_for_pickup") },
            { id: 6, ...t("ready_for_pickup") },
          ],
        },
      ],
    });
    expect(await pickUp(executor, [1])).toEqual({
      handedOverIds: [5, 6],
      requestedIds: [5, 6],
    });
  });

  it("refuses a shoe whose repaint is still wet", async () => {
    // Kept here, not in the pickup screen, so a Courier hand-off inherits it.
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [
            { id: 5, ...t("ready_for_pickup") },
            { id: 6, ...t("processing") },
          ],
        },
      ],
    });
    let error: unknown;
    try {
      await pickUp(executor, [1]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Items not ready for pickup: #ORD-S001"
    );
  });

  it("lets a bag go when the treatment holding it back was cancelled", async () => {
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [
            { id: 5, ...t("ready_for_pickup") },
            { id: 6, ...t("cancelled") },
          ],
        },
      ],
    });
    expect((await pickUp(executor, [1])).handedOverIds).toEqual([5]);
  });

  it("refuses an object the customer already collected", async () => {
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [{ id: 5, ...t("picked_up", PICKUP_EVENT) }],
        },
      ],
    });
    let error: unknown;
    try {
      await pickUp(executor, [1]);
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).message).toBe(
      "Items not ready for pickup: #ORD-S001"
    );
  });

  it("gives back a pair that was refunded before anyone came for it", async () => {
    // Refunded while queued, but the Customer still takes the Item home: the
    // status stays, and the row records the handover.
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [{ id: 5, ...t("refunded") }],
        },
      ],
    });
    expect(await pickUp(executor, [1])).toEqual({
      handedOverIds: [5],
      requestedIds: [5],
    });
  });

  it("hands over the finished treatment and the refunded one together", async () => {
    // Clean done, repaint refunded: one Item across the counter, so both rows
    // record the same handover.
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [
            { id: 5, ...t("ready_for_pickup") },
            { id: 6, ...t("refunded") },
          ],
        },
      ],
    });
    expect(await pickUp(executor, [1])).toEqual({
      handedOverIds: [5, 6],
      requestedIds: [5, 6],
    });
  });

  it("refuses a refunded pair the customer has already taken home", async () => {
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [{ id: 5, ...t("refunded", PICKUP_EVENT) }],
        },
      ],
    });
    let error: unknown;
    try {
      await pickUp(executor, [1]);
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).message).toBe(
      "Items not ready for pickup: #ORD-S001"
    );
  });

  it("refuses an object that lives on someone else's ticket", async () => {
    const executor = makePickupExecutor({ items: [] });
    let error: unknown;
    try {
      await pickUp(executor, [1]);
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).message).toBe(
      "One or more items do not belong to this order"
    );
  });

  it("reports a short flip so the caller can roll the handover back", async () => {
    // Two cashiers hand over the same Order; the loser rolls back.
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [
            { id: 5, ...t("ready_for_pickup") },
            { id: 6, ...t("ready_for_pickup") },
          ],
        },
      ],
      flipped: [5],
    });
    expect(await pickUp(executor, [1])).toEqual({
      handedOverIds: [5],
      requestedIds: [5, 6],
    });
  });
});

describe("transitionOrderService photo gate (ADR-0012, ADR-0019)", () => {
  const dropOff = new Date("2026-09-01T02:00:00Z");

  const expectBlocked = async (executor: DbExecutor, message: string) => {
    let error: unknown;
    try {
      await transitionTo(executor, "processing");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(message);
  };

  it("blocks queued -> processing while the object has no photo at all", async () => {
    await expectBlocked(
      makeExecutor({ serviceStatus: "queued" }),
      "Add an item photo before starting work"
    );
  });

  // One Item photo at drop-off unlocks every Service on that Item.
  it("allows queued -> processing on the cashier's drop-off shot of the object", async () => {
    const executor = makeExecutor({
      serviceStatus: "queued",
      photosAt: [dropOff],
    });
    expect(await transitionTo(executor, "processing")).toEqual({
      from: "queued",
      to: "processing",
    });
  });

  it("exempts the qc_reject -> processing redo from the gate", async () => {
    const executor = makeExecutor({ serviceStatus: "qc_reject" });
    expect(await transitionTo(executor, "processing")).toEqual({
      from: "qc_reject",
      to: "processing",
    });
  });

  // A Complaint brings the Item back; first-visit photos say nothing about its
  // state now, so the Rework waits for a fresh one.
  describe("a Rework of a complained pair", () => {
    const complaintOpened = new Date("2026-09-08T04:00:00Z");

    it("blocks on first-visit photos only", async () => {
      await expectBlocked(
        makeExecutor({
          serviceStatus: "queued",
          photosAt: [dropOff],
          reworkOpenedAt: complaintOpened,
        }),
        "Take a new photo of the item before starting this rework"
      );
    });

    it("allows once the returned pair has been photographed", async () => {
      const executor = makeExecutor({
        serviceStatus: "queued",
        photosAt: [dropOff, new Date("2026-09-08T04:10:00Z")],
        reworkOpenedAt: complaintOpened,
      });
      expect(await transitionTo(executor, "processing")).toEqual({
        from: "queued",
        to: "processing",
      });
    });
  });
});

describe("billableOrderTotal", () => {
  const svc = (status: OrderServiceStatus, subtotal: string) => ({
    status,
    subtotal,
  });
  const prod = (subtotal: string, cancelled = false) => ({
    cancelled_at: cancelled ? new Date() : null,
    subtotal,
  });

  it("drops a cancelled repair so the counter stops asking for it", () => {
    // The Customer declines a 200k Repair quote before paying.
    expect(
      billableOrderTotal(
        [svc("queued", "60000"), svc("cancelled", "200000")],
        []
      )
    ).toBe(60_000);
  });

  it("keeps a refunded line on the bill", () => {
    // The Refund is already recorded on the Order; dropping the Line here too
    // would count it twice.
    expect(billableOrderTotal([svc("refunded", "60000")], [])).toBe(60_000);
  });

  it("drops cancelled product lines and keeps the rest", () => {
    expect(
      billableOrderTotal(
        [svc("queued", "60000")],
        [prod("25000"), prod("50000", true)]
      )
    ).toBe(85_000);
  });

  it("comes to nothing once every line is cancelled", () => {
    expect(
      billableOrderTotal([svc("cancelled", "60000")], [prod("25000", true)])
    ).toBe(0);
  });
});

describe("summarizeOrderFulfillment", () => {
  it("counts ready_for_pickup, picked_up, terminal, and active", () => {
    // Five dropped off, one cancelled: the Customer will leave with four, one
    // already collected.
    const summary = summarizeOrderFulfillment([
      "ready_for_pickup",
      "ready_for_pickup",
      "picked_up",
      "processing",
      "cancelled",
    ]);
    expect(summary.total_count).toBe(4);
    expect(summary.ready_for_pickup_count).toBe(2);
    expect(summary.picked_up_count).toBe(1);
    expect(summary.terminal_count).toBe(2);
    expect(summary.active_count).toBe(3);
    expect(summary.remaining_count).toBe(3);
  });

  it("keeps a refunded pair still on the shelf in the remaining count", () => {
    // Refunded but not yet collected: the shop still holds the Item.
    const summary = summarizeOrderFulfillment(["picked_up", "refunded"]);
    expect(summary.total_count).toBe(2);
    expect(summary.picked_up_count).toBe(1);
    expect(summary.remaining_count).toBe(1);
  });

  it("flags partial pickup when picked_up co-exists with active services", () => {
    const summary = summarizeOrderFulfillment(["picked_up", "processing"]);
    expect(summary.is_partially_picked_up).toBe(true);
    expect(summary.is_ready_for_pickup).toBe(false);
  });

  it("flags ready_for_pickup when every active service is ready", () => {
    const summary = summarizeOrderFulfillment([
      "ready_for_pickup",
      "ready_for_pickup",
    ]);
    expect(summary.is_ready_for_pickup).toBe(true);
    expect(summary.is_partially_picked_up).toBe(false);
  });
});

describe("nextReadyAt shelf clock", () => {
  it("does not restart the wait when a rollup finds the order still on the shelf", () => {
    // Pricing or payment recomputes the Order; stamping now would reset the
    // clock, and an uncollected Item would never show Overdue.
    const readyAt = nextReadyAt("ready_for_pickup");

    expect(readyAt).not.toBeInstanceOf(Date);
    expect(is(readyAt, SQL)).toBe(true);
  });

  it("clears the shelf clock when work reopens", () => {
    // After a QC reject the wait starts over when the Item returns.
    expect(nextReadyAt("processing")).toBeNull();
    expect(nextReadyAt("created")).toBeNull();
  });

  it("clears the shelf clock once the order is off the books", () => {
    expect(nextReadyAt("completed")).toBeNull();
    expect(nextReadyAt("cancelled")).toBeNull();
  });
});
