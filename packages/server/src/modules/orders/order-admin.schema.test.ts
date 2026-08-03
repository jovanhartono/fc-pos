import { describe, expect, it } from "bun:test";
import { POSTOrderServicePhotoPresignSchema } from "@/modules/orders/order-admin.schema";

describe("POSTOrderServicePhotoPresignSchema", () => {
  it("rejects HEIC now that the counter phone converts before upload", () => {
    // An accepted HEIC used to reach the bucket unconverted and open as a
    // broken image when the operator pulled it up against a damage claim.
    expect(
      POSTOrderServicePhotoPresignSchema.safeParse({
        content_type: "image/heic",
      }).success
    ).toBe(false);
  });

  it("accepts what the counter phone actually uploads", () => {
    for (const content_type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(
        POSTOrderServicePhotoPresignSchema.safeParse({ content_type }).success
      ).toBe(true);
    }
  });

  it("tolerates padding a phone browser adds to the content type header", () => {
    expect(
      POSTOrderServicePhotoPresignSchema.parse({
        content_type: " image/jpeg ",
      })
    ).toEqual({ content_type: "image/jpeg" });
  });
});
