import { describe, expect, it } from "bun:test";
import { GETOrdersQuerySchema } from "@/modules/orders/order.schema";

describe("GETOrdersQuerySchema overdue/status pairing", () => {
  it("rejects a status that contradicts overdue", () => {
    // An overdue Order is still on the shelf; an empty list for "overdue and
    // completed" would wrongly tell the counter nothing is late.
    expect(
      GETOrdersQuerySchema.safeParse({ overdue: "true", status: "completed" })
        .success
    ).toBe(false);
  });

  it("accepts overdue paired with the shelf it already implies", () => {
    expect(
      GETOrdersQuerySchema.safeParse({
        overdue: "true",
        status: "ready_for_pickup",
      }).success
    ).toBe(true);
  });

  it("leaves each filter alone on its own", () => {
    expect(GETOrdersQuerySchema.safeParse({ overdue: "true" }).success).toBe(
      true
    );
    expect(
      GETOrdersQuerySchema.safeParse({ status: "cancelled" }).success
    ).toBe(true);
  });
});
