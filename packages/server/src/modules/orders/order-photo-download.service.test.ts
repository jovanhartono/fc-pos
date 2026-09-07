// The save button hands a customer a copy of the evidence a dispute is argued from. What these
// guard: the file is named after the pair or the order it shows, only staff at that branch get
// one, and our credentials never sign a link for anything an order does not point at — or for
// a file that is no longer there.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { s3 } from "bun";
import type { StoredPhoto } from "@/modules/orders/order-photo-download.repository";
import { authorizationDouble } from "@/test-support/authorization-double";
import type { JWTPayload } from "@/types";

let filed = new Map<string, StoredPhoto>();
const assertCalls: { storeId: number; userId: number }[] = [];

// Stand in for the database: which stored keys an order points at, and what they show.
mock.module("@/modules/orders/order-photo-download.repository", () => ({
  findPhotoByPath: (path: string) => Promise.resolve(filed.get(path) ?? null),
}));
mock.module("@/utils/authorization", () =>
  authorizationDouble({ assertCalls, storeIds: [] })
);

const { createPhotoDownloadUrl } = await import(
  "@/modules/orders/order-photo.service"
);

const cashier = { id: 7, role: "cashier" } as JWTPayload;
const ORDER_CODE = "#JKT/20260907/12";
const KEY = "prod/orders/1042/items/88/3f9a";
const SEED_KEY = "seed/orders/jkt_20260907_12/dropoff/handover.jpg";

describe("createPhotoDownloadUrl", () => {
  const originalBase = process.env.CDN_BASE_URL;
  let presign: ReturnType<typeof spyOn<typeof s3, "presign">>;
  let read: ReturnType<typeof spyOn<typeof s3, "file">>;
  let stored = true;

  // Stand in for the bucket: whether the one-byte read the service makes finds the object.
  const stubObject = () =>
    ({
      slice: () => ({
        bytes: () =>
          stored
            ? Promise.resolve(new Uint8Array(1))
            : Promise.reject(
                Object.assign(new Error("gone"), { code: "NoSuchKey" })
              ),
      }),
    }) as unknown as ReturnType<typeof s3.file>;

  beforeEach(() => {
    process.env.CDN_BASE_URL = "https://cdn.fresclean.id";
    filed = new Map([
      [KEY, { code: `${ORDER_CODE}-I001`, store_id: 3, suffix: "photo-31" }],
      [SEED_KEY, { code: ORDER_CODE, store_id: 3, suffix: "dropoff" }],
    ]);
    stored = true;
    assertCalls.length = 0;
    presign = spyOn(s3, "presign").mockReturnValue("https://s3.example/signed");
    read = spyOn(s3, "file").mockImplementation(stubObject);
  });

  afterEach(() => {
    presign.mockRestore();
    read.mockRestore();
    if (originalBase === undefined) {
      delete process.env.CDN_BASE_URL;
    } else {
      process.env.CDN_BASE_URL = originalBase;
    }
  });

  it("names an Item shot after the tag on the pair, kept apart from its sibling shots", async () => {
    const result = await createPhotoDownloadUrl({
      body: { image_url: `https://cdn.fresclean.id/${KEY}` },
      user: cashier,
    });

    expect(result).toEqual({ url: "https://s3.example/signed" });
    expect(presign).toHaveBeenCalledWith(
      KEY,
      expect.objectContaining({
        method: "GET",
        contentDisposition:
          'attachment; filename="JKT-20260907-12-I001-photo-31.webp"',
      })
    );
  });

  it("keeps the extension a seed photo was filed with, since those are not WebP", async () => {
    await createPhotoDownloadUrl({
      body: { image_url: `https://cdn.fresclean.id/${SEED_KEY}` },
      user: cashier,
    });

    expect(presign).toHaveBeenCalledWith(
      SEED_KEY,
      expect.objectContaining({
        contentDisposition:
          'attachment; filename="JKT-20260907-12-dropoff.jpg"',
      })
    );
  });

  it("asks the same branch question as opening the order, so a Kemang cashier gets no Bintaro photo", async () => {
    await createPhotoDownloadUrl({
      body: { image_url: `https://cdn.fresclean.id/${KEY}` },
      user: cashier,
    });

    expect(assertCalls).toEqual([{ storeId: 3, userId: 7 }]);
  });

  it("refuses a link to a photo no order points at, so a stale or guessed key gets nothing", async () => {
    await expect(
      createPhotoDownloadUrl({
        body: {
          image_url: "https://cdn.fresclean.id/prod/orders/1042/items/88/gone",
        },
        user: cashier,
      })
    ).rejects.toThrow("Photo not found");
    expect(presign).not.toHaveBeenCalled();
  });

  it("reports a photo whose file has gone from the bucket, rather than signing a link to an error page", async () => {
    stored = false;
    await expect(
      createPhotoDownloadUrl({
        body: { image_url: `https://cdn.fresclean.id/${KEY}` },
        user: cashier,
      })
    ).rejects.toThrow("no longer in storage");
    expect(presign).not.toHaveBeenCalled();
  });

  it("refuses a link that is not to our CDN at all", async () => {
    await expect(
      createPhotoDownloadUrl({
        body: { image_url: `https://evil.example/${KEY}` },
        user: cashier,
      })
    ).rejects.toThrow("Not a stored photo");
    expect(presign).not.toHaveBeenCalled();
  });
});
