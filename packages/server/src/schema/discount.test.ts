import { describe, expect, it } from "bun:test";
import {
  type CampaignDiscountInput,
  computeCampaignContribution,
  type DiscountLine,
  stackCampaignDiscounts,
} from "@/schema/discount";

const fixed = (
  value: number,
  over: Partial<CampaignDiscountInput> = {}
): CampaignDiscountInput => ({
  discount_type: "fixed",
  discount_value: String(value),
  max_discount: null,
  ...over,
});

const percentage = (
  value: number,
  over: Partial<CampaignDiscountInput> = {}
): CampaignDiscountInput => ({
  discount_type: "percentage",
  discount_value: String(value),
  max_discount: null,
  ...over,
});

const bogo = (
  over: Partial<CampaignDiscountInput> = {}
): CampaignDiscountInput => ({
  discount_type: "buy_n_get_m_free",
  discount_value: "0",
  max_discount: null,
  buy_quantity: 1,
  free_quantity: 1,
  eligible_service_ids: [1],
  ...over,
});

const line = (service_id: number, price: number): DiscountLine => ({
  price,
  service_id,
});

describe("computeCampaignContribution", () => {
  it("returns the fixed value", () => {
    expect(computeCampaignContribution(fixed(10_000), 100_000, 100_000)).toBe(
      10_000
    );
  });

  it("computes percentage of the remaining total, not the gross", () => {
    expect(computeCampaignContribution(percentage(10), 200_000, 150_000)).toBe(
      15_000
    );
  });

  it("caps at max_discount", () => {
    // The capped-voucher case: 10% of 210k is 21k, capped to 15k.
    expect(
      computeCampaignContribution(
        percentage(10, { max_discount: "15000" }),
        210_000,
        210_000
      )
    ).toBe(15_000);
  });

  it("returns zero below min_order_total", () => {
    expect(
      computeCampaignContribution(
        fixed(10_000, { min_order_total: "200000" }),
        150_000,
        150_000
      )
    ).toBe(0);
  });

  it("gates min_order_total on the gross total even when remaining is lower", () => {
    expect(
      computeCampaignContribution(
        fixed(10_000, { min_order_total: "200000" }),
        200_000,
        50_000
      )
    ).toBe(10_000);
  });

  it("clamps to the remaining total", () => {
    expect(computeCampaignContribution(fixed(50_000), 100_000, 20_000)).toBe(
      20_000
    );
  });

  it("returns zero when nothing remains", () => {
    expect(computeCampaignContribution(fixed(10_000), 100_000, 0)).toBe(0);
  });

  it("rounds to whole rupiah", () => {
    expect(computeCampaignContribution(percentage(10), 33_333, 33_333)).toBe(
      3333
    );
  });

  describe("buy_n_get_m_free", () => {
    it("gives the cheapest eligible lines free", () => {
      expect(
        computeCampaignContribution(bogo(), 180_000, 180_000, [
          line(1, 100_000),
          line(1, 80_000),
        ])
      ).toBe(80_000);
    });

    it("ignores lines outside eligible_service_ids", () => {
      expect(
        computeCampaignContribution(bogo(), 180_000, 180_000, [
          line(1, 100_000),
          line(2, 80_000),
        ])
      ).toBe(0);
    });

    it("returns zero when the group quantity is not reached", () => {
      expect(
        computeCampaignContribution(
          bogo({ buy_quantity: 2, free_quantity: 1 }),
          180_000,
          180_000,
          [line(1, 100_000), line(1, 80_000)]
        )
      ).toBe(0);
    });

    it("returns zero without eligible_service_ids", () => {
      expect(
        computeCampaignContribution(
          bogo({ eligible_service_ids: [] }),
          180_000,
          180_000,
          [line(1, 100_000), line(1, 80_000)]
        )
      ).toBe(0);
    });
  });
});

describe("stackCampaignDiscounts", () => {
  it("applies the biggest contribution first, later ones against the remainder", () => {
    const { total, breakdown } = stackCampaignDiscounts(100_000, [
      percentage(10),
      fixed(20_000),
    ]);

    expect(breakdown.map((b) => b.amount)).toEqual([20_000, 8000]);
    expect(total).toBe(28_000);
  });

  it("never exceeds the gross total", () => {
    const { total, breakdown } = stackCampaignDiscounts(100_000, [
      fixed(80_000),
      fixed(50_000),
    ]);

    expect(breakdown.map((b) => b.amount)).toEqual([80_000, 20_000]);
    expect(total).toBe(100_000);
  });

  it("sums the breakdown to the total", () => {
    const { total, breakdown } = stackCampaignDiscounts(210_000, [
      percentage(10, { max_discount: "15000" }),
      fixed(5000),
    ]);

    expect(breakdown.reduce((sum, b) => sum + b.amount, 0)).toBe(total);
  });

  it("returns zero for no campaigns", () => {
    const { total, breakdown } = stackCampaignDiscounts(100_000, []);

    expect(total).toBe(0);
    expect(breakdown).toEqual([]);
  });
});
