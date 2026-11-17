import { describe, expect, it } from "bun:test";

import { previewRefund } from "@/features/orders/lib/refund-preview";

const s1 = { id: 1, kind: "service" as const };
const s2 = { id: 2, kind: "service" as const };
const p1 = { id: 1, kind: "product" as const };

describe("previewRefund", () => {
  it("refunds a lone line its cap, rounded to the rupiah", () => {
    const caps = new Map([
      ["service:1", 50_000],
      ["service:2", 100.6],
    ]);
    const preview = previewRefund(caps, [s1, s2], []);
    expect(preview.byLine.get("service:1")).toBe(50_000);
    expect(preview.byLine.get("service:2")).toBe(101);
  });

  // Alone each line rounds 100.5 up; picked together the set rounds once and
  // the spare rupiah goes to the lower id.
  it("shifts the leftover rupiah across a picked pair", () => {
    const caps = new Map([
      ["service:1", 100.5],
      ["service:2", 100.5],
    ]);
    expect(previewRefund(caps, [s1, s2], []).byLine).toEqual(
      new Map([
        ["service:1", 101],
        ["service:2", 101],
      ])
    );
    const picked = previewRefund(caps, [s1, s2], [s1, s2]);
    expect(picked.byLine.get("service:1")).toBe(101);
    expect(picked.byLine.get("service:2")).toBe(100);
    expect(picked.total).toBe(201);
  });

  it("shows 0 for a line with nothing left to refund, picked or not", () => {
    const caps = new Map([
      ["service:1", 0],
      ["product:1", 20_000],
    ]);
    expect(previewRefund(caps, [s1, p1], []).byLine.get("service:1")).toBe(0);
    const picked = previewRefund(caps, [s1, p1], [s1, p1]);
    expect(picked.byLine.get("service:1")).toBe(0);
    expect(picked.total).toBe(20_000);
  });

  it("totals only the picked lines, as shown", () => {
    const caps = new Map([
      ["service:1", 30_000.4],
      ["service:2", 15_000.3],
      ["product:1", 9999.6],
    ]);
    const picked = [s1, p1];
    const preview = previewRefund(caps, [s1, s2, p1], picked);
    expect(preview.total).toBe(
      (preview.byLine.get("service:1") ?? 0) +
        (preview.byLine.get("product:1") ?? 0)
    );
    expect(preview.total).toBe(40_000);
    expect(previewRefund(caps, [s1, s2, p1], []).total).toBe(0);
  });
});
