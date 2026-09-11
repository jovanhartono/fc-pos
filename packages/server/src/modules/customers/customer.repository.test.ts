import { describe, expect, it } from "bun:test";
import {
  summarizeUnpaidOrders,
  type UnpaidOrderState,
} from "@/modules/customers/customer.repository";

const order = (
  total: string,
  discount: string,
  services: UnpaidOrderState["services"]
): UnpaidOrderState => ({ discount, services, total });

const priced = { price: "250000", status: "queued" };
const awaitingPrice = { price: null, status: "queued" };

describe("summarizeUnpaidOrders", () => {
  it("owes nothing when the customer has no unpaid orders", () => {
    expect(summarizeUnpaidOrders([])).toEqual({
      unpaid_amount: "0",
      unpaid_orders: 0,
      unpriced_orders: 0,
    });
  });

  it("bills an unpaid order at its total net of the settled discount", () => {
    expect(summarizeUnpaidOrders([order("440000", "30000", [priced])])).toEqual(
      {
        unpaid_amount: "410000",
        unpaid_orders: 1,
        unpriced_orders: 0,
      }
    );
  });

  it("adds up across several unpaid orders", () => {
    const summary = summarizeUnpaidOrders([
      order("100000", "0", [priced]),
      order("440000", "30000", [priced]),
    ]);

    expect(summary.unpaid_amount).toBe("510000");
    expect(summary.unpaid_orders).toBe(2);
  });

  // The bag whose repair the workshop has not inspected yet: quoting a number
  // for it would bill the customer for a price nobody agreed to (ADR-0018).
  it("quotes no amount for an order still waiting on a repair price", () => {
    expect(
      summarizeUnpaidOrders([order("100000", "0", [priced, awaitingPrice])])
    ).toEqual({
      unpaid_amount: "0",
      unpaid_orders: 1,
      unpriced_orders: 1,
    });
  });

  it("still bills the priced orders alongside one awaiting a price", () => {
    const summary = summarizeUnpaidOrders([
      order("440000", "30000", [priced]),
      order("100000", "0", [awaitingPrice]),
    ]);

    expect(summary.unpaid_amount).toBe("410000");
    expect(summary.unpaid_orders).toBe(2);
    expect(summary.unpriced_orders).toBe(1);
  });

  // A cancelled line took the unpaid off-ramp, so its blank price no longer
  // holds the rest of the order hostage (ADR-0008).
  it("bills normally when the only unpriced line was cancelled", () => {
    const summary = summarizeUnpaidOrders([
      order("100000", "0", [priced, { price: null, status: "cancelled" }]),
    ]);

    expect(summary.unpaid_amount).toBe("100000");
    expect(summary.unpriced_orders).toBe(0);
  });
});
