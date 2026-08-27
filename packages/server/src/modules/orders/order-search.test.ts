import { describe, expect, it } from "bun:test";
import { isNumericSearch } from "@/modules/orders/order-search";

describe("isNumericSearch", () => {
  it("treats a bare number as an id — staff read '512' off the order screen and search it directly", () => {
    expect(isNumericSearch("512")).toBe(true);
  });

  it("treats an order code as a prefix search, never an id — codes carry the '#STORE/' prefix", () => {
    expect(isNumericSearch("#JKT/20260801/12")).toBe(false);
  });

  it("treats an item code the same way — '#JKT/20260801/12-S001' is the tag on an object, not an id", () => {
    expect(isNumericSearch("#JKT/20260801/12-S001")).toBe(false);
  });

  it("a customer phone prefix is all digits, so it also passes the id gate — pre-existing behavior the shared rule keeps", () => {
    expect(isNumericSearch("0812")).toBe(true);
  });

  it("rejects the empty string so an all-optional filter never turns into an id match", () => {
    expect(isNumericSearch("")).toBe(false);
  });
});
