import { describe, expect, it } from "bun:test";
import { POSTOrderSchema } from "@/schema";

// Minimal valid order: one object with one treatment on it, a valid E.164
// phone, unpaid (so no payment method is required). Only voucher_codes varies
// per test.
const baseOrder = {
  customer: { name: "Budi", phone_number: "+6281234567890" },
  store_id: 1,
  payment_status: "unpaid" as const,
  items: [{ services: [{ id: 1 }] }],
};

describe("POSTOrderSchema — voucher_codes", () => {
  it("defaults to an empty array when omitted", () => {
    const result = POSTOrderSchema.safeParse(baseOrder);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.voucher_codes).toEqual([]);
    }
  });

  it("trims and uppercases each code", () => {
    const result = POSTOrderSchema.safeParse({
      ...baseOrder,
      voucher_codes: ["  abc123de  ", "xyz789fg"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.voucher_codes).toEqual(["ABC123DE", "XYZ789FG"]);
    }
  });

  it("rejects duplicates that collide only after normalization", () => {
    const result = POSTOrderSchema.safeParse({
      ...baseOrder,
      voucher_codes: ["abc123de", "ABC123DE"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.includes("voucher_codes")
      );
      expect(issue?.message).toBe("Duplicate voucher codes are not allowed");
    }
  });
});

// ADR-0017: the counter drops off objects and sells treatments against them.
describe("POSTOrderSchema — items", () => {
  it("takes one pair sold three treatments as a single object", () => {
    const result = POSTOrderSchema.safeParse({
      ...baseOrder,
      items: [
        {
          brand: "Nike",
          color: "Black",
          services: [{ id: 1 }, { id: 2 }, { id: 3 }],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items?.[0].services).toHaveLength(3);
    }
  });

  it("refuses an object with nothing being done to it", () => {
    const result = POSTOrderSchema.safeParse({
      ...baseOrder,
      items: [{ brand: "Nike", services: [] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Every item needs at least one service"
      );
    }
  });

  it("leaves the descriptors optional — the tag and the code identify the object", () => {
    const result = POSTOrderSchema.safeParse({
      ...baseOrder,
      items: [{ services: [{ id: 1 }] }],
    });
    expect(result.success).toBe(true);
  });
});
