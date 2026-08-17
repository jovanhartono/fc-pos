import { describe, expect, it } from "bun:test";
import { GETOrdersQuerySchema } from "@/modules/orders/order.schema";

describe("GETOrdersQuerySchema overdue/status pairing", () => {
  it("rejects a status that contradicts overdue", () => {
    // An overdue Item is by definition still on the ready-for-pickup shelf, so
    // asking for overdue collected orders describes nothing the shop can hold.
    // Answered as an empty list it reads as "no late orders" — the reassurance
    // the counter must never get from a question it did not ask.
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
