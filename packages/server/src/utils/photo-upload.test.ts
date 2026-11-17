import { beforeEach, describe, expect, it, mock } from "bun:test";
import { STORAGE_ENV_PREFIX } from "@/utils/photo-key";

const reencoded: string[] = [];

mock.module("@/utils/s3", () => ({
  createPresignedUploadUrl: () => ({}),
  optimizeUploadedImage: (key: string) => {
    reencoded.push(key);
    return Promise.resolve();
  },
}));

const { acceptPhotoUpload } = await import("@/utils/photo-upload");

// The re-encode overwrites the object at the path it is given, so a stale tab handing back
// another Order's Drop-off photo path must be stopped before it, not after.
describe("acceptPhotoUpload", () => {
  const scope = { kind: "dropoff", orderId: 1042 } as const;

  beforeEach(() => {
    reencoded.length = 0;
  });

  it("re-encodes a photo filed under its own Order", async () => {
    const path = `${STORAGE_ENV_PREFIX}orders/1042/dropoff/3f9a`;
    await acceptPhotoUpload(scope, path);
    expect(reencoded).toEqual([path]);
  });

  it("refuses another Order's photo and leaves it untouched", async () => {
    const otherOrderPath = `${STORAGE_ENV_PREFIX}orders/999/dropoff/3f9a`;
    await expect(acceptPhotoUpload(scope, otherOrderPath)).rejects.toThrow(
      "Invalid image path"
    );
    expect(reencoded).toHaveLength(0);
  });
});
