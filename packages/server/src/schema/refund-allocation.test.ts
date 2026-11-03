import { describe, expect, it } from "bun:test";
import {
  allocateRefund,
  lineDiscountShares,
  lineKey,
  lineRefundCap,
  orderLineRefundCaps,
  type RefundLineRef,
} from "@/schema/refund-allocation";

const caps = (entries: [string, number][]) => new Map(entries);

const service = (id: number): RefundLineRef => ({ kind: "service", id });
const product = (id: number): RefundLineRef => ({ kind: "product", id });

describe("lineRefundCap", () => {
  it("takes the line's discount share off its gross", () => {
    expect(
      lineRefundCap({
        alreadyRefunded: 0,
        discountShare: 5000,
        grossLine: 50_000,
      })
    ).toBe(45_000);
  });

  it("subtracts what was already refunded", () => {
    expect(
      lineRefundCap({
        alreadyRefunded: 40_000,
        discountShare: 5000,
        grossLine: 50_000,
      })
    ).toBe(5000);
  });

  it("clamps at zero when refunds exceed the cap", () => {
    expect(
      lineRefundCap({
        alreadyRefunded: 60_000,
        discountShare: 5000,
        grossLine: 50_000,
      })
    ).toBe(0);
  });

  it("clamps at zero when the discount exceeds the line gross", () => {
    expect(
      lineRefundCap({
        alreadyRefunded: 0,
        discountShare: 5000,
        grossLine: 1000,
      })
    ).toBe(0);
  });
});

describe("lineDiscountShares", () => {
  const DCS = 1;
  const HARD_STAIN = 34;
  const line = (id: number, serviceId: number, gross: number) => ({
    bogoServiceId: serviceId,
    gross,
    key: lineKey("service", id),
  });
  // Prod Order 1482: 5 DCS + 6 Hard Stain, Pay 4 Get 1 on DCS only.
  const order1482 = [
    ...[1, 2, 3, 4, 5].map((id) => line(id, DCS, 60_000)),
    ...[6, 7, 8, 9, 10, 11].map((id) => line(id, HARD_STAIN, 40_000)),
  ];
  const pay4Get1 = {
    amount: 60_000,
    buy_quantity: 4,
    eligibleServiceIds: [DCS],
    free_quantity: 1,
  };

  it("keeps a Buy N Get M discount on the lines that earned it", () => {
    const shares = lineDiscountShares({
      bogoDiscounts: [pay4Get1],
      lines: order1482,
      orderDiscount: 60_000,
    });

    expect(shares.get(lineKey("service", 11))).toBe(0);
    expect(shares.get(lineKey("service", 1))).toBe(12_000);
  });

  it("spreads a discount with no Buy N Get M over every line by price", () => {
    const shares = lineDiscountShares({
      bogoDiscounts: [],
      lines: order1482,
      orderDiscount: 60_000,
    });

    expect(shares.get(lineKey("service", 11))).toBeCloseTo(4444.44, 1);
  });

  it("leaves cancelled and Rework lines out of the Buy N Get M share", () => {
    const dcs = (id: number, over: object = {}) => ({
      complaint_id: null,
      id,
      service: { price: "60000" },
      service_id: DCS,
      status: "queued",
      subtotal: "60000",
      ...over,
    });
    const refundCaps = orderLineRefundCaps({
      campaigns: [
        {
          applied_amount: "60000",
          buy_quantity: 1,
          campaign: { eligibleServices: [{ service_id: DCS }] },
          discount_type: "buy_n_get_m_free",
          free_quantity: 1,
        },
      ],
      discount: "60000",
      products: [],
      refundedByLineKey: new Map(),
      services: [
        dcs(1),
        dcs(2),
        dcs(3, { status: "cancelled" }),
        dcs(4, { complaint_id: 7 }),
      ],
    });

    expect(refundCaps.get(lineKey("service", 1))).toBe(30_000);
    expect(refundCaps.get(lineKey("service", 4))).toBe(60_000);
  });

  it("spreads over the whole Order when no eligible line is left", () => {
    const shares = lineDiscountShares({
      bogoDiscounts: [pay4Get1],
      lines: [line(1, HARD_STAIN, 40_000), line(2, HARD_STAIN, 40_000)],
      orderDiscount: 60_000,
    });

    expect(shares.get(lineKey("service", 1))).toBe(30_000);
  });

  it("hands what the eligible lines can't hold to the rest of the Order", () => {
    // Buy 1 Get 1 booked 150.000, then cancellations left one group of 2 DCS.
    // Paid 100.000, so the caps must add up to 100.000, not more.
    const shares = lineDiscountShares({
      bogoDiscounts: [
        {
          amount: 150_000,
          buy_quantity: 1,
          eligibleServiceIds: [DCS],
          free_quantity: 1,
        },
      ],
      lines: [
        line(1, DCS, 50_000),
        line(2, DCS, 50_000),
        line(3, HARD_STAIN, 150_000),
      ],
      orderDiscount: 150_000,
    });

    expect(shares.get(lineKey("service", 1))).toBe(50_000);
    expect(shares.get(lineKey("service", 3))).toBe(50_000);
  });

  it("keeps the free amount on the eligible lines when less than a group is left", () => {
    // Pay 4 Get 1 settled on 5 DCS, then one DCS was cancelled before payment.
    const shares = lineDiscountShares({
      bogoDiscounts: [pay4Get1],
      lines: [
        ...[1, 2, 3, 4].map((id) => line(id, DCS, 60_000)),
        line(5, HARD_STAIN, 40_000),
      ],
      orderDiscount: 60_000,
    });

    expect(shares.get(lineKey("service", 1))).toBe(15_000);
    expect(shares.get(lineKey("service", 5))).toBe(0);
  });

  it("leaves an eligible line that fills no group out of the free share", () => {
    // Prod Order 390: 10 DCS make the two Pay 4 Get 1 groups; the DCSS is
    // the 11th line and earned nothing.
    const DCSS = 2;
    const shares = lineDiscountShares({
      bogoDiscounts: [
        { ...pay4Get1, amount: 120_000, eligibleServiceIds: [DCS, DCSS] },
      ],
      lines: [
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => line(id, DCS, 60_000)),
        line(11, DCSS, 150_000),
      ],
      orderDiscount: 120_000,
    });

    expect(shares.get(lineKey("service", 1))).toBe(12_000);
    expect(shares.get(lineKey("service", 11))).toBe(0);
  });

  it("shares the free amount evenly when same-priced lines spill past a group", () => {
    // 6 DCS, one group of 5: no single DCS is the leftover, so all 6 carry it.
    const shares = lineDiscountShares({
      bogoDiscounts: [pay4Get1],
      lines: [1, 2, 3, 4, 5, 6].map((id) => line(id, DCS, 60_000)),
      orderDiscount: 60_000,
    });

    for (const id of [1, 2, 3, 4, 5, 6]) {
      expect(shares.get(lineKey("service", id))).toBe(10_000);
    }
  });

  it("never shares out more than the Order discount", () => {
    const shares = lineDiscountShares({
      bogoDiscounts: [pay4Get1],
      lines: order1482,
      orderDiscount: 30_000,
    });
    const total = [...shares.values()].reduce((sum, share) => sum + share, 0);

    expect(total).toBe(30_000);
    expect(shares.get(lineKey("service", 11))).toBe(0);
  });
});

describe("allocateRefund", () => {
  it("refunds whole-rupiah caps as-is", () => {
    const items = allocateRefund({
      capsByLineKey: caps([
        [lineKey("service", 1), 10_000],
        [lineKey("product", 2), 5000],
      ]),
      lines: [service(1), product(2)],
    });

    expect(items.map((i) => i.amount)).toEqual([10_000, 5000]);
  });

  it("sums to the rounded total when caps are fractional", () => {
    const items = allocateRefund({
      capsByLineKey: caps([
        [lineKey("service", 1), 33.4],
        [lineKey("service", 2), 33.4],
        [lineKey("service", 3), 33.2],
      ]),
      lines: [service(1), service(2), service(3)],
    });

    // 100.0 total → floors give 99; the leftover rupiah goes to the largest
    // remainder, ties broken by lower id.
    expect(items.map((i) => i.amount)).toEqual([34, 33, 33]);
    expect(items.reduce((sum, i) => sum + i.amount, 0)).toBe(100);
  });

  it("breaks equal remainders across kinds deterministically", () => {
    const items = allocateRefund({
      capsByLineKey: caps([
        [lineKey("service", 1), 10.5],
        [lineKey("product", 1), 10.5],
      ]),
      lines: [service(1), product(1)],
    });

    // "product" sorts before "service" — the product line takes the extra unit.
    expect(items.find((i) => i.kind === "product")?.amount).toBe(11);
    expect(items.find((i) => i.kind === "service")?.amount).toBe(10);
  });

  it("preserves extra line fields", () => {
    const items = allocateRefund({
      capsByLineKey: caps([[lineKey("service", 1), 100]]),
      lines: [{ ...service(1), note: "torn", reason: "damaged" }],
    });

    expect(items[0]).toEqual({
      kind: "service",
      id: 1,
      note: "torn",
      reason: "damaged",
      amount: 100,
    });
  });

  it("throws when a line has no cap entry", () => {
    expect(() =>
      allocateRefund({
        capsByLineKey: caps([]),
        lines: [service(1)],
      })
    ).toThrow("Order service 1 has no refundable amount remaining");
  });

  it("throws when a line's cap is zero", () => {
    expect(() =>
      allocateRefund({
        capsByLineKey: caps([[lineKey("product", 7), 0]]),
        lines: [product(7)],
      })
    ).toThrow("Order product 7 has no refundable amount remaining");
  });
});
