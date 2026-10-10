import { describe, expect, it } from "bun:test";
import {
  PATCHOrderServiceStatusSchema,
  POSTItemPhotoPresignSchema,
} from "@/modules/orders/order-admin.schema";

describe("PATCHOrderServiceStatusSchema", () => {
  // The checker sends a pair back from quality check; the owner reads the
  // reason on the Quality report, so a reject with no reason is refused.
  const refusal = (body: Record<string, unknown>) => {
    const result = PATCHOrderServiceStatusSchema.safeParse(body);
    return result.success
      ? null
      : result.error.issues.map((issue) => [issue.path, issue.message]);
  };

  it("refuses a QC reject with no note", () => {
    expect(refusal({ status: "qc_reject" })).toEqual([
      [["note"], "Say what's wrong"],
    ]);
  });

  it("refuses a QC reject whose note is only spaces", () => {
    expect(refusal({ status: "qc_reject", note: "   " })).toEqual([
      [["note"], "Say what's wrong"],
    ]);
  });

  it("takes a QC reject that says what is wrong", () => {
    expect(
      PATCHOrderServiceStatusSchema.parse({
        status: "qc_reject",
        note: " stain on toe box ",
      })
    ).toEqual({ status: "qc_reject", note: "stain on toe box" });
  });

  it("still lets every other move go without a note", () => {
    for (const status of ["processing", "quality_check", "ready_for_pickup"]) {
      expect(refusal({ status })).toBeNull();
    }
  });
});

describe("POSTItemPhotoPresignSchema", () => {
  it("rejects HEIC now that the counter phone converts before upload", () => {
    // An accepted HEIC used to reach the bucket unconverted and open as a
    // broken image when the operator pulled it up against a damage claim.
    expect(
      POSTItemPhotoPresignSchema.safeParse({
        content_type: "image/heic",
      }).success
    ).toBe(false);
  });

  it("accepts what the counter phone actually uploads", () => {
    for (const content_type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(
        POSTItemPhotoPresignSchema.safeParse({ content_type }).success
      ).toBe(true);
    }
  });

  it("tolerates padding a phone browser adds to the content type header", () => {
    expect(
      POSTItemPhotoPresignSchema.parse({
        content_type: " image/jpeg ",
      })
    ).toEqual({ content_type: "image/jpeg" });
  });
});
