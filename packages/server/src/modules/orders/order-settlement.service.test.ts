import { describe, expect, it } from "bun:test";
import { BadRequestException } from "@/http-exceptions";
import {
  assertDiscountRequestAllowed,
  assertLinePrice,
  assertPayable,
  type SettlementLine,
} from "@/modules/orders/order-settlement.service";

// The checks every screen runs before a discount settles on an Order (ADR-0018).

const line = (over: Partial<SettlementLine> = {}): SettlementLine => ({
  complaint_id: null,
  price: "150000",
  service: { price: "150000" },
  service_id: 21,
  status: "queued",
  ...over,
});

// A Repair not yet inspected: no list price and no agreed price.
const BLANK_REPAIR = line({ price: null, service: { price: null } });

const NO_PROMO = { campaign_ids: [], discount: 0, voucher_codes: [] };

const expectRefusal = (run: () => void, message: string) => {
  expect(run).toThrow(BadRequestException);
  expect(run).toThrow(message);
};

describe("assertLinePrice", () => {
  it("refuses zero — 0 means deliberately free, which is a Rework", () => {
    expectRefusal(() => assertLinePrice(0), "Price must be greater than zero");
  });

  it("refuses a negative number nobody could hand over", () => {
    expectRefusal(
      () => assertLinePrice(-1000),
      "Price must be greater than zero"
    );
  });

  it("accepts the number the workshop agreed", () => {
    expect(() => assertLinePrice(250_000)).not.toThrow();
  });
});

describe("assertPayable", () => {
  it("refuses the whole Order while one line is still blank", () => {
    // Deep clean plus an unpriced Repair: no money at all until the price is
    // agreed, since there is no part payment (ADR-0001).
    expectRefusal(
      () => assertPayable([line(), BLANK_REPAIR]),
      "Order has an unpriced line — set its price before collecting payment"
    );
  });

  it("ignores a blank line the counter already cancelled", () => {
    // The Customer heard the quote and declined; the cancelled Repair no
    // longer holds up payment for the deep clean (ADR-0008).
    expect(() =>
      assertPayable([line(), { ...BLANK_REPAIR, status: "cancelled" }])
    ).not.toThrow();
  });

  it("passes once every live line carries a number", () => {
    expect(() =>
      assertPayable([line(), line({ price: "250000", service_id: 30 })])
    ).not.toThrow();
  });
});

describe("assertDiscountRequestAllowed", () => {
  it("bounces a voucher while any line is still blank", () => {
    // ADR-0018: a Repair guessed at 200k clears a 250k minimum, the Voucher
    // code is spent, then inspection prices it at 80k.
    expectRefusal(
      () =>
        assertDiscountRequestAllowed({
          hasBlankLine: true,
          isSettled: false,
          request: { ...NO_PROMO, voucher_codes: ["VIP12345"] },
        }),
      "Order has an unpriced line — promotions wait until every item is priced"
    );
  });

  it("bounces a hand-keyed discount on a blank Order the same way", () => {
    expectRefusal(
      () =>
        assertDiscountRequestAllowed({
          hasBlankLine: true,
          isSettled: false,
          request: { ...NO_PROMO, discount: 25_000 },
        }),
      "Order has an unpriced line — promotions wait until every item is priced"
    );
  });

  it("refuses a second promo once one is printed on the Receipt", () => {
    // A cashier re-applies the Campaign at pickup; stacking it would double
    // the discount and spend another code.
    expectRefusal(
      () =>
        assertDiscountRequestAllowed({
          hasBlankLine: false,
          isSettled: true,
          request: { ...NO_PROMO, campaign_ids: [5] },
        }),
      "This order's discount was settled at drop-off — collect the printed total"
    );
  });

  it("lets a blank Order through when nobody asked for a promo", () => {
    // The ordinary Repair drop-off: tag, photo, gross Receipt, no discount.
    expect(() =>
      assertDiscountRequestAllowed({
        hasBlankLine: true,
        isSettled: false,
        request: NO_PROMO,
      })
    ).not.toThrow();
  });

  it("lets a settled Order through when the payment desk asks for nothing", () => {
    expect(() =>
      assertDiscountRequestAllowed({
        hasBlankLine: false,
        isSettled: true,
        request: NO_PROMO,
      })
    ).not.toThrow();
  });
});
