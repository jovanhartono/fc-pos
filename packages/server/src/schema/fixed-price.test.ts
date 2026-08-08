import { describe, expect, it } from "bun:test";
import { fixedPriceSubtotal } from "@/schema/fixed-price";

// The number under test is the Campaign base (ADR-0019): what a promotion's
// minimum is checked against and what its discount is computed from. Repair
// is quoted work that can be re-priced after checkout, so it must move this
// number by exactly zero — firm or Estimate alike.

describe("fixedPriceSubtotal", () => {
  it("keeps a Repair quote out of the campaign base", () => {
    // Deep clean 150k plus a bag repair quoted 200k. The promo desk must see
    // 150k — the repair may come back from inspection at any other number.
    const base = fixedPriceSubtotal([
      { has_list_price: true, subtotal: 150_000 },
      { has_list_price: false, subtotal: 200_000 },
    ]);

    expect(base).toBe(150_000);
  });

  it("stops the ADR-0019 failure: a fat estimate unlocking a minimum it cannot hold", () => {
    // The recorded incident shape: gross 350k clears a "min order 250k"
    // voucher, inspection later drops the repair to 80k and the order never
    // qualified. On the fixed-price base the voucher is refused up front.
    const MIN_ORDER_TOTAL = 250_000;
    const base = fixedPriceSubtotal([
      { has_list_price: true, subtotal: 150_000 },
      { has_list_price: false, subtotal: 200_000 },
    ]);

    expect(base).toBeLessThan(MIN_ORDER_TOTAL);
  });

  it("is the plain cart total when every line is catalog-priced", () => {
    // No quoted work in the cart — the campaign base and the gross total are
    // the same number, so existing orders price exactly as before.
    const base = fixedPriceSubtotal([
      { has_list_price: true, subtotal: 150_000 },
      { has_list_price: true, subtotal: 45_000 },
      { has_list_price: true, subtotal: 25_000 },
    ]);

    expect(base).toBe(220_000);
  });

  it("is zero for a repair-only order — quoted work reaches no threshold", () => {
    // A 900k re-panel alone does not clear a 250k minimum (ADR-0019
    // consequence): Repair is quoted work, not catalogue spend.
    expect(
      fixedPriceSubtotal([{ has_list_price: false, subtotal: 900_000 }])
    ).toBe(0);
  });

  it("is zero for an empty cart", () => {
    expect(fixedPriceSubtotal([])).toBe(0);
  });
});
