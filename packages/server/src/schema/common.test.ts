import { describe, expect, it } from "bun:test";
import { currencySchema } from "@/schema/common";

describe("currencySchema", () => {
  it("reads a dot in a typed price as a thousands separator, not cents", () => {
    // A shelf tag at the counter reads Rp1.500 for fifteen hundred rupiah, so
    // punctuation in a typed price is grouping — 1500.75 is a hundred and fifty
    // thousand and seventy-five rupiah, never fifteen hundred plus change.
    expect(currencySchema("Price").parse("1500.75")).toBe(150_075);
  });

  it("refuses a discount the cashier typed as a negative", () => {
    // A minus at the till is a slip of the hand. Stripping punctuation would
    // erase the sign and hand the customer a real Rp500 off instead.
    const result = currencySchema("Discount").safeParse("-500");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Discount cannot be negative"
      );
    }
  });
});
