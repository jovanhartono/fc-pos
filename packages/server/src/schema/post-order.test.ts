import { describe, expect, it } from "bun:test";
import { POSTOrderSchema } from "@/schema";

// Minimal valid order: one service line, a valid E.164 phone, unpaid (so no
// payment method is required). Only voucher_codes varies per test.
const baseOrder = {
  customer: { name: "Budi", phone_number: "+6281234567890" },
  store_id: 1,
  payment_status: "unpaid" as const,
  services: [{ id: 1 }],
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
