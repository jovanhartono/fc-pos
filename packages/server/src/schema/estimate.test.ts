import { describe, expect, it } from "bun:test";
import {
  hasUnconfirmedEstimate,
  isUnconfirmedEstimate,
} from "@/schema/estimate";

// The predicate behind the ADR-0018 payment gate: an Order carrying any
// unconfirmed Estimate cannot be marked paid. Both the server's paid
// transition and the web's payment controls run these exact checks.

describe("isUnconfirmedEstimate", () => {
  it("flags a Repair entered as an Estimate and not yet settled", () => {
    // Cashier keyed 200k but was not sure — the number is provisional until
    // inspection, and it holds the Order's payment.
    expect(
      isUnconfirmedEstimate({
        estimated_price: "200000",
        estimate_confirmed_at: null,
        status: "queued",
      })
    ).toBe(true);
  });

  it("does not flag a firm line — firm is a commitment, payable at drop-off", () => {
    // The trained cashier quoted 300k as firm: no estimated_price is
    // recorded, the shop absorbs any inspection surprise (ADR-0018).
    expect(
      isUnconfirmedEstimate({
        estimated_price: null,
        estimate_confirmed_at: null,
        status: "queued",
      })
    ).toBe(false);
  });

  it("releases the gate once the Estimate is confirmed", () => {
    expect(
      isUnconfirmedEstimate({
        estimated_price: "200000",
        estimate_confirmed_at: new Date("2026-08-02T04:00:00Z"),
        status: "processing",
      })
    ).toBe(false);
  });

  it("ignores a cancelled Estimate line — its money left the order", () => {
    // Customer declined the quote and the line was cancelled (unpaid
    // off-ramp, ADR-0008). The rest of the Order must still be collectable.
    expect(
      isUnconfirmedEstimate({
        estimated_price: "200000",
        estimate_confirmed_at: null,
        status: "cancelled",
      })
    ).toBe(false);
  });
});

describe("hasUnconfirmedEstimate", () => {
  it("one unsettled quote holds the whole mixed order (ADR-0018 consequence)", () => {
    // Deep clean 150k (known) + estimated repair: the 150k is not collectable
    // at drop-off either — the accepted alternative to splitting the Order.
    expect(
      hasUnconfirmedEstimate([
        {
          estimated_price: null,
          estimate_confirmed_at: null,
          status: "queued",
        },
        {
          estimated_price: "200000",
          estimate_confirmed_at: null,
          status: "queued",
        },
      ])
    ).toBe(true);
  });

  it("passes an order with no estimate lines at all", () => {
    expect(
      hasUnconfirmedEstimate([
        {
          estimated_price: null,
          estimate_confirmed_at: null,
          status: "ready_for_pickup",
        },
      ])
    ).toBe(false);
  });

  it("passes an empty order — products-only orders never carry estimates", () => {
    expect(hasUnconfirmedEstimate([])).toBe(false);
  });
});
