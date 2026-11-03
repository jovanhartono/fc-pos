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
  const pay4Get1 = { amount: 60_000, eligibleServiceIds: [DCS] };

  it("keeps a Buy N Get M discount on the lines that earned it", () => {
    const shares = lineDiscountShares({
      bogoDiscounts: [pay4Get1],
      grossTotal: 540_000,
      lines: order1482,
      orderDiscount: 60_000,
    });

    expect(shares.get(lineKey("service", 11))).toBe(0);
    expect(shares.get(lineKey("service", 1))).toBe(12_000);
  });

  it("spreads a discount with no Buy N Get M over every line by price", () => {
    const shares = lineDiscountShares({
      bogoDiscounts: [],
      grossTotal: 540_000,
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
          campaign: { eligibleServices: [{ service_id: DCS }] },
          discount_type: "buy_n_get_m_free",
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
      total: "240000",
    });

    expect(refundCaps.get(lineKey("service", 1))).toBe(30_000);
    expect(refundCaps.get(lineKey("service", 4))).toBe(60_000);
  });

  it("spreads over the whole Order when no eligible line is left", () => {
    const shares = lineDiscountShares({
      bogoDiscounts: [pay4Get1],
      grossTotal: 80_000,
      lines: [line(1, HARD_STAIN, 40_000), line(2, HARD_STAIN, 40_000)],
      orderDiscount: 60_000,
    });

    expect(shares.get(lineKey("service", 1))).toBe(30_000);
  });

  it("hands what the eligible lines can't hold to the rest of the Order", () => {
    // Buy 1 Get 1 booked 100.000 for 2 free DCS, then 3 of 4 were cancelled.
    const shares = lineDiscountShares({
      bogoDiscounts: [{ amount: 100_000, eligibleServiceIds: [DCS] }],
      grossTotal: 250_000,
      lines: [line(1, DCS, 50_000), line(2, HARD_STAIN, 200_000)],
      orderDiscount: 100_000,
    });

    expect(shares.get(lineKey("service", 1))).toBe(50_000 + 10_000);
    expect(shares.get(lineKey("service", 2))).toBe(40_000);
  });

  it("never shares out more than the Order discount", () => {
    const shares = lineDiscountShares({
      bogoDiscounts: [pay4Get1],
      grossTotal: 540_000,
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
