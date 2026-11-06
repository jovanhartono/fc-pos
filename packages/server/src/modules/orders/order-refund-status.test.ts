import { describe, expect, it } from "bun:test";
import { deriveOrderRefundStatus } from "@/modules/orders/order-refund-status";

// The Refund status badge: a wrong "full" or a missing one leads staff to
// refund twice or chase money that never moved.

const noFee = { delivery_fee: "0" };

describe("deriveOrderRefundStatus", () => {
  it("shows no badge on an order whose money is untouched", () => {
    expect(
      deriveOrderRefundStatus({
        ...noFee,
        paid_amount: "150000",
        refunded_amount: "0",
      })
    ).toBe("none");
  });

  it("flags partial when one ruined garment of a bigger order was refunded", () => {
    expect(
      deriveOrderRefundStatus({
        ...noFee,
        paid_amount: "150000",
        refunded_amount: "50000",
      })
    ).toBe("partial");
  });

  it("flags full at exact payback and beyond so staff never refund again", () => {
    // An overshoot (a typo, a top-up) still means the Customer has it all back,
    // or someone at the counter issues a second Refund.
    expect(
      deriveOrderRefundStatus({
        ...noFee,
        paid_amount: "150000",
        refunded_amount: "150000",
      })
    ).toBe("full");
    expect(
      deriveOrderRefundStatus({
        ...noFee,
        paid_amount: "150000",
        refunded_amount: "160000",
      })
    ).toBe("full");
  });

  it("treats decimal-formatted numerics as the same rupiah", () => {
    // Postgres numerics can arrive as "90000.00"; full must not drop to partial.
    expect(
      deriveOrderRefundStatus({
        delivery_fee: "0.00",
        paid_amount: "90000.00",
        refunded_amount: "90000.00",
      })
    ).toBe("full");
  });

  it("shows no badge on a legacy row that was never paid nor refunded", () => {
    expect(
      deriveOrderRefundStatus({
        delivery_fee: null,
        paid_amount: null,
        refunded_amount: null,
      })
    ).toBe("none");
  });

  it("never claims full when nothing was actually paid", () => {
    // Money paid out on an Order that never collected any: "full" would hide
    // that this Order earned nothing.
    expect(
      deriveOrderRefundStatus({
        ...noFee,
        paid_amount: "0",
        refunded_amount: "10000",
      })
    ).toBe("partial");
  });

  it("ignores a corrupted negative refund instead of showing a phantom badge", () => {
    // A bad import wrote "-5000"; no money left the counter, so no badge.
    expect(
      deriveOrderRefundStatus({
        ...noFee,
        paid_amount: "100000",
        refunded_amount: "-5000",
      })
    ).toBe("none");
  });

  // ADR-0029: the courier trips happened, so the shop keeps the fee.
  it("calls every Line refunded full even though the Delivery fee stays", () => {
    expect(
      deriveOrderRefundStatus({
        delivery_fee: "25000",
        paid_amount: "175000",
        refunded_amount: "150000",
      })
    ).toBe("full");
  });

  it("calls one Line of a delivered Order partial", () => {
    expect(
      deriveOrderRefundStatus({
        delivery_fee: "25000",
        paid_amount: "175000",
        refunded_amount: "50000",
      })
    ).toBe("partial");
  });

  it("shows no badge on a paid Order with a fee and no refund", () => {
    expect(
      deriveOrderRefundStatus({
        delivery_fee: "25000",
        paid_amount: "175000",
        refunded_amount: "0",
      })
    ).toBe("none");
  });
});
