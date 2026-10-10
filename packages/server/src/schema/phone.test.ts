import { describe, expect, it } from "bun:test";
import { phoneSchema } from "@/schema/common";
import { normalizePhoneNumber, toStoredPhonePrefix } from "@/schema/phone";

describe("normalizePhoneNumber", () => {
  it("turns a local 08... number into +62 form", () => {
    // The counter types the number the customer says out loud; the database
    // stores one canonical form so a repeat customer's Order always matches.
    expect(normalizePhoneNumber("08123456789")).toBe("+628123456789");
  });
});

describe("toStoredPhonePrefix", () => {
  it("finds a customer from the first digits said out loud", () => {
    expect(toStoredPhonePrefix("0812")).toBe("+62812");
    expect(toStoredPhonePrefix("0812-34 5")).toBe("+62812345");
  });

  it("leaves names, codes and already-stored numbers alone", () => {
    expect(toStoredPhonePrefix("Rina")).toBe("Rina");
    expect(toStoredPhonePrefix("#BSD/0710")).toBe("#BSD/0710");
    expect(toStoredPhonePrefix("+62812")).toBe("+62812");
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
