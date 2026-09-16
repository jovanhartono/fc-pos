import { describe, expect, it } from "bun:test";
import { POSTOrderSchema } from "@/schema";

// The database refuses these combinations outright (ADR-0020). Catching them in
// the payload is what turns a constraint violation into a message naming the
// field the cashier got wrong.
const base = {
  customer: { name: "Bu Sri", phone_number: "+6281234567890" },
  items: [{ brand: "Nike", services: [{ id: 1 }] }],
  payment_status: "unpaid" as const,
  store_id: 1,
};

const parse = (patch: Record<string, unknown>) =>
  POSTOrderSchema.safeParse({ ...base, ...patch });

describe("how an order says it arrived", () => {
  it("defaults to a walk-in when nothing says otherwise", () => {
    const result = parse({});
    expect(result.success).toBe(true);
    expect(result.data?.intake_channel).toBe("walk_in");
  });

  it("accepts a courier order that names its courier", () => {
    expect(parse({ collected_by: 9, intake_channel: "courier" }).success).toBe(
      true
    );
  });

  it("rejects a courier order with no courier named", () => {
    expect(parse({ intake_channel: "courier" }).success).toBe(false);
  });

  it("rejects a courier on an order that did not come by courier", () => {
    expect(parse({ collected_by: 9, intake_channel: "shipped" }).success).toBe(
      false
    );
  });

  it("accepts a parcel from another city", () => {
    expect(
      parse({ intake_channel: "shipped", origin_postal_code: "40115" }).success
    ).toBe(true);
  });

  // An overseas parcel still counts as shipped in; it just contributes to no
  // city, because postal_codes holds Indonesian codes only.
  it("accepts a parcel whose origin nobody could determine", () => {
    expect(parse({ intake_channel: "shipped" }).success).toBe(true);
  });

  it("refuses an origin on a walk-in, who is standing at the counter", () => {
    expect(parse({ origin_postal_code: "40115" }).success).toBe(false);
  });
});
