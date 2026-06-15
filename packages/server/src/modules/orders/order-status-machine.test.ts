import { describe, expect, it } from "bun:test";
import { orderServiceStatusEnum } from "@/db/schema";
import {
  deriveOrderStatus,
  isTerminalOrderServiceStatus,
  ORDER_SERVICE_TRANSITIONS,
  ORDER_TERMINAL_SERVICE_STATUSES,
  type OrderServiceStatus,
  summarizeOrderFulfillment,
} from "@/modules/orders/order-status-machine";

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
