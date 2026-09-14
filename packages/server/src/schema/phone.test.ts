import { describe, expect, it } from "bun:test";
import { phoneSchema } from "@/schema/common";
import { normalizePhoneNumber } from "@/schema/phone";

describe("normalizePhoneNumber", () => {
  it("turns a local 08... number into +62 form", () => {
    // The counter types the number the customer says out loud; the database
    // stores one canonical form so a repeat customer's Order always matches.
    expect(normalizePhoneNumber("08123456789")).toBe("+628123456789");
  });
});

describe("phoneSchema", () => {
  it("accepts a local number and stores the +62 form", () => {
    expect(phoneSchema.parse("08123456789")).toBe("+628123456789");
  });

  it("refuses a number that isn't a real phone number", () => {
    const result = phoneSchema.safeParse("123");

    expect(result.success).toBe(false);
  });
});
