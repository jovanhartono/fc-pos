import { describe, expect, it } from "bun:test";
import {
  allocateRefund,
  lineKey,
  lineRefundCap,
  type RefundLineRef,
} from "@/schema/refund-allocation";

const caps = (entries: [string, number][]) => new Map(entries);

const service = (id: number): RefundLineRef => ({ kind: "service", id });
const product = (id: number): RefundLineRef => ({ kind: "product", id });

describe("lineRefundCap", () => {
  it("prorates the order discount by the line's share of gross total", () => {
    expect(
      lineRefundCap({
        alreadyRefunded: 0,
        grossLine: 50_000,
        grossTotal: 100_000,
        orderDiscount: 10_000,
      })
    ).toBe(45_000);
  });

  it("subtracts what was already refunded", () => {
    expect(
      lineRefundCap({
        alreadyRefunded: 40_000,
        grossLine: 50_000,
        grossTotal: 100_000,
        orderDiscount: 10_000,
      })
    ).toBe(5000);
  });

  it("clamps at zero when refunds exceed the cap", () => {
    expect(
      lineRefundCap({
        alreadyRefunded: 60_000,
        grossLine: 50_000,
        grossTotal: 100_000,
        orderDiscount: 10_000,
      })
    ).toBe(0);
  });

  it("clamps at zero when the discount exceeds the line gross", () => {
    expect(
      lineRefundCap({
        alreadyRefunded: 0,
        grossLine: 1000,
        grossTotal: 1000,
        orderDiscount: 5000,
      })
    ).toBe(0);
  });

  it("skips discount proration when gross total is zero", () => {
    expect(
      lineRefundCap({
        alreadyRefunded: 0,
        grossLine: 0,
        grossTotal: 0,
        orderDiscount: 5000,
      })
    ).toBe(0);
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
