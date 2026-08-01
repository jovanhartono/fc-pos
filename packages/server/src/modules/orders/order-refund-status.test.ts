import { describe, expect, it } from "bun:test";
import { deriveOrderRefundStatus } from "@/modules/orders/order-refund-status";

// deriveOrderRefundStatus paints the refund badge staff see on the orders
// dashboard: "none" means the money is untouched, "partial" means some went
// back, "full" means the customer already has everything — attempting another
// refund would hand out cash twice. Pure derivation over Postgres numeric
// strings; nothing is mocked.

describe("deriveOrderRefundStatus", () => {
  it("shows no badge on an order whose money is untouched", () => {
    expect(
      deriveOrderRefundStatus({ paid_amount: "150000", refunded_amount: "0" })
    ).toBe("none");
  });

  it("flags partial when one ruined garment of a bigger order was refunded", () => {
    expect(
      deriveOrderRefundStatus({
        paid_amount: "150000",
        refunded_amount: "50000",
      })
    ).toBe("partial");
  });

  it("flags full at exact payback and beyond so staff never refund again", () => {
    // Whether the payback matched the payment or overshot it (goodwill top-up,
    // fat-fingered amount), the customer holds all their money — the badge must
    // say full either way or someone at the desk will issue a second refund.
    expect(
      deriveOrderRefundStatus({
        paid_amount: "150000",
        refunded_amount: "150000",
      })
    ).toBe("full");
    expect(
      deriveOrderRefundStatus({
        paid_amount: "150000",
        refunded_amount: "160000",
      })
    ).toBe("full");
  });

  it("treats decimal-formatted numerics as the same rupiah", () => {
    // Postgres numeric columns can arrive as "90000.00" — same money, and the
    // badge must not downgrade full to partial over formatting.
    expect(
      deriveOrderRefundStatus({
        paid_amount: "90000.00",
        refunded_amount: "90000.00",
      })
    ).toBe("full");
  });

  it("shows no badge on a legacy row that was never paid nor refunded", () => {
    expect(
      deriveOrderRefundStatus({ paid_amount: null, refunded_amount: null })
    ).toBe("none");
  });

  it("never claims full when nothing was actually paid", () => {
    // Goodwill payout on an order the till never collected: "full" would imply
    // the payment cycle is closed, hiding that this order earned nothing.
    expect(
      deriveOrderRefundStatus({ paid_amount: "0", refunded_amount: "10000" })
    ).toBe("partial");
  });

  it("ignores a corrupted negative refund instead of showing a phantom badge", () => {
    // A bad import wrote refunded_amount "-5000". No money ever left the till,
    // so staff must not see a refund badge that sends them auditing nothing.
    expect(
      deriveOrderRefundStatus({
        paid_amount: "100000",
        refunded_amount: "-5000",
      })
    ).toBe("none");
  });
});
