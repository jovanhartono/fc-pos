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
  isItemCollectable,
  isTerminalOrderServiceStatus,
  nextReadyAt,
  ORDER_SERVICE_TRANSITIONS,
  ORDER_TERMINAL_SERVICE_STATUSES,
  type OrderServiceStatus,
  summarizeOrderFulfillment,
  transitionOrderService,
} from "@/modules/orders/order-status-machine";

interface AnyLine {
  id: number;
  status: OrderServiceStatus;
}

const s = (status: OrderServiceStatus) => ({ status });
// product line state: cancelled vs active/refunded (only cancellation affects rollup)
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
    // refunded product lines carry refunded_at, not cancelled_at
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
    // The customer dropped one treatment off the ticket before anyone touched
    // the rack. Nothing has been worked on, so the order has not started —
    // reading the cancellation as progress tells the customer the shop is
    // cleaning a shoe that is still sitting untouched.
    expect(deriveOrderStatus([s("cancelled"), s("queued")], [])).toBe(
      "created"
    );
    expect(
      deriveOrderStatus([s("cancelled"), s("cancelled"), s("queued")], [])
    ).toBe("created");
  });

  it("returns 'processing' when a line was delivered and the rest are queued", () => {
    // Unlike a cancellation, a picked-up or refunded line is work that really
    // happened, so the order is genuinely under way.
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

// ADR-0017. An Item has no status column: what it is doing is read off the
// treatments applied to it, so there is nothing to drift.
describe("deriveItemStatus", () => {
  it("reads as queued while the pair is still waiting to be started", () => {
    expect(deriveItemStatus([s("queued"), s("queued")])).toBe("queued");
  });

  it("reads as processing the moment any one treatment is under way", () => {
    // Three jobs on one shoe: the object is in the workshop as soon as the
    // first worker picks it up, whatever the other two are doing.
    expect(deriveItemStatus([s("queued"), s("processing"), s("queued")])).toBe(
      "processing"
    );
    expect(deriveItemStatus([s("queued"), s("quality_check")])).toBe(
      "processing"
    );
  });

  it("reaches the shelf only when every live treatment is finished", () => {
    expect(
      deriveItemStatus([s("ready_for_pickup"), s("ready_for_pickup")])
    ).toBe("ready_for_pickup");
    // One still in the workshop keeps the whole object off the shelf.
    expect(deriveItemStatus([s("ready_for_pickup"), s("processing")])).toBe(
      "processing"
    );
  });

  it("ignores a cancelled sibling when the rest are done", () => {
    // Work the shop is never going to do must not strand the object.
    expect(deriveItemStatus([s("ready_for_pickup"), s("cancelled")])).toBe(
      "ready_for_pickup"
    );
  });

  it("still reads as queued when a cancelled treatment is the only thing that moved", () => {
    // The shoe is on the rack untouched. This status is what the customer sees
    // on /track, so calling it processing promises work nobody has started.
    expect(deriveItemStatus([s("cancelled"), s("queued")])).toBe("queued");
  });

  it("reads as picked_up once nothing live is left on it", () => {
    expect(deriveItemStatus([s("picked_up")])).toBe("picked_up");
    expect(deriveItemStatus([s("picked_up"), s("refunded")])).toBe("picked_up");
    // A refund is still an object that left the shop, not a cancelled one.
    expect(deriveItemStatus([s("refunded"), s("cancelled")])).toBe("picked_up");
  });

  it("reads as cancelled only when the whole object was called off", () => {
    expect(deriveItemStatus([s("cancelled"), s("cancelled")])).toBe(
      "cancelled"
    );
  });
});

describe("isItemCollectable", () => {
  it("lets an object go when every live treatment on it is ready", () => {
    expect(
      isItemCollectable([s("ready_for_pickup"), s("ready_for_pickup")])
    ).toBe(true);
    expect(isItemCollectable([s("ready_for_pickup"), s("cancelled")])).toBe(
      true
    );
  });

  it("holds it back while any treatment is still live and unfinished", () => {
    expect(isItemCollectable([s("ready_for_pickup"), s("processing")])).toBe(
      false
    );
    expect(isItemCollectable([s("queued")])).toBe(false);
  });

  it("refuses an object with nothing left to hand over", () => {
    // Already collected, so re-scanning the tag must not mint a second
    // handover for a shoe that is out of the shop.
    expect(isItemCollectable([s("picked_up")])).toBe(false);
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

// transitionOrderService takes its DB handle as a parameter, so a hand-rolled
// fake executor exercises the photo gate without a database. The fluent
// update/insert stubs only need to satisfy the write + rollup path that runs
// once the gate passes.
const makeExecutor = ({
  serviceStatus,
  hasPhoto,
}: {
  serviceStatus: OrderServiceStatus;
  hasPhoto: boolean;
}) =>
  ({
    query: {
      ordersServicesTable: {
        findFirst: () => Promise.resolve({ id: 1, status: serviceStatus }),
        findMany: () =>
          Promise.resolve([{ status: "processing" as OrderServiceStatus }]),
      },
      orderServicesImagesTable: {
        findFirst: () => Promise.resolve(hasPhoto ? { id: 10 } : undefined),
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

// The pickup desk hands over whole objects, so completePickup resolves an
// Item's own treatments rather than trusting a list of line ids. `flipped` is
// what the guarded UPDATE won — set it short to stand in for another cashier
// getting there first.
const makePickupExecutor = ({
  items,
  flipped,
}: {
  items: { id: number; item_code: string; services: AnyLine[] }[];
  flipped?: number[];
}) => {
  const readyIds = items.flatMap((item) =>
    item.services
      .filter((service) => service.status === "ready_for_pickup")
      .map((service) => service.id)
  );

  return {
    query: {
      itemsTable: { findMany: () => Promise.resolve(items) },
      ordersServicesTable: { findMany: () => Promise.resolve([]) },
      ordersProductsTable: { findMany: () => Promise.resolve([]) },
    },
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () =>
            Promise.resolve((flipped ?? readyIds).map((id) => ({ id }))),
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
  it("flips every finished treatment on the object, not a chosen subset", async () => {
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [
            { id: 5, status: "ready_for_pickup" },
            { id: 6, status: "ready_for_pickup" },
          ],
        },
      ],
    });
    expect(await pickUp(executor, [1])).toEqual({
      flippedIds: [5, 6],
      requestedIds: [5, 6],
    });
  });

  it("refuses a shoe whose repaint is still wet", async () => {
    // The rule lives here rather than at the desk, so any future caller — a
    // courier hand-off, a bulk release — inherits it.
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [
            { id: 5, status: "ready_for_pickup" },
            { id: 6, status: "processing" },
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
            { id: 5, status: "ready_for_pickup" },
            { id: 6, status: "cancelled" },
          ],
        },
      ],
    });
    expect((await pickUp(executor, [1])).flippedIds).toEqual([5]);
  });

  it("refuses an object the customer already collected", async () => {
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [{ id: 5, status: "picked_up" }],
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
    // Two counters serving the same order: the guarded UPDATE wins fewer rows
    // than it asked for, and the desk turns that into a rollback.
    const executor = makePickupExecutor({
      items: [
        {
          id: 1,
          item_code: "#ORD-S001",
          services: [
            { id: 5, status: "ready_for_pickup" },
            { id: 6, status: "ready_for_pickup" },
          ],
        },
      ],
      flipped: [5],
    });
    expect(await pickUp(executor, [1])).toEqual({
      flippedIds: [5],
      requestedIds: [5, 6],
    });
  });
});

describe("transitionOrderService photo gate (ADR-0012)", () => {
  it("blocks queued -> processing when the service has no photo", async () => {
    const executor = makeExecutor({ serviceStatus: "queued", hasPhoto: false });
    let error: unknown;
    try {
      await transitionTo(executor, "processing");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Add an item photo before starting work"
    );
  });

  it("allows queued -> processing once a photo exists", async () => {
    const executor = makeExecutor({ serviceStatus: "queued", hasPhoto: true });
    expect(await transitionTo(executor, "processing")).toEqual({
      from: "queued",
      to: "processing",
    });
  });

  it("exempts the qc_reject -> processing redo from the gate", async () => {
    const executor = makeExecutor({
      serviceStatus: "qc_reject",
      hasPhoto: false,
    });
    expect(await transitionTo(executor, "processing")).toEqual({
      from: "qc_reject",
      to: "processing",
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
    // Customer brings in a deep clean and a bag repair, hears the 200k quote
    // and says no. Staff cancel that line before any money changes hands, so
    // only the deep clean is left to collect.
    expect(
      billableOrderTotal(
        [svc("queued", "60000"), svc("cancelled", "200000")],
        []
      )
    ).toBe(60_000);
  });

  it("keeps a refunded line on the bill", () => {
    // The shop cleaned the shoes, handed them back, and later returned the
    // money. That sale still happened, and the refund is recorded on the
    // order, so taking it off here too would count it twice.
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
    const summary = summarizeOrderFulfillment([
      "ready_for_pickup",
      "ready_for_pickup",
      "picked_up",
      "processing",
      "cancelled",
    ]);
    expect(summary.service_total_count).toBe(5);
    expect(summary.ready_for_pickup_count).toBe(2);
    expect(summary.picked_up_count).toBe(1);
    expect(summary.terminal_count).toBe(2);
    expect(summary.active_count).toBe(3);
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
    // Editing a repair price or taking payment recomputes the order. Stamping
    // the current time here would push the shelf clock forward every time, and
    // a pair nobody has collected in a week would never reach the Overdue pill.
    // A plain Date is exactly that regression, so reject one.
    const readyAt = nextReadyAt("ready_for_pickup");

    expect(readyAt).not.toBeInstanceOf(Date);
    expect(is(readyAt, SQL)).toBe(true);
  });

  it("clears the shelf clock when work reopens", () => {
    // A failed quality check sends the Item back to the workshop. The customer
    // cannot collect it, so the wait starts over when it returns to the shelf.
    expect(nextReadyAt("processing")).toBeNull();
    expect(nextReadyAt("created")).toBeNull();
  });

  it("clears the shelf clock once the order is off the books", () => {
    expect(nextReadyAt("completed")).toBeNull();
    expect(nextReadyAt("cancelled")).toBeNull();
  });
});
