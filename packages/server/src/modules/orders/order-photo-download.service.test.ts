// The save button hands a customer a copy of the evidence a dispute is argued from. What these
// guard: the file is named after the pair or the order it shows, only staff at that branch get
// one, and our credentials never sign a link for a photo that is not on file — or whose file
// is no longer there.

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
import type { StoredPhoto } from "@/modules/orders/order-photo.repository";
import { authorizationDouble } from "@/test-support/authorization-double";
import type { JWTPayload } from "@/types";

let filed = new Map<string, StoredPhoto>();
const assertCalls: { storeId: number; userId: number }[] = [];

// Stand in for the database: which photos are on file, by where they are filed and their row.
mock.module("@/modules/orders/order-photo.repository", () => ({
  findPhotoById: ({ kind, id }: { kind: string; id: number }) =>
    Promise.resolve(filed.get(`${kind}:${id}`) ?? null),
  softDeleteItemImageById: () => Promise.resolve([]),
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
    filed = new Map([
      [
        "item:31",
        {
          code: `${ORDER_CODE}-I001`,
          image_path: KEY,
          store_id: 3,
          suffix: "photo-31",
        },
      ],
      [
        "dropoff:12",
        {
          code: ORDER_CODE,
          image_path: SEED_KEY,
          store_id: 3,
          suffix: "dropoff",
        },
      ],
    ]);
    stored = true;
    assertCalls.length = 0;
    presign = spyOn(s3, "presign").mockReturnValue("https://s3.example/signed");
    read = spyOn(s3, "file").mockImplementation(stubObject);
  });

  afterEach(() => {
    presign.mockRestore();
    read.mockRestore();
  });

  it("names an Item shot after the tag on the pair, kept apart from its sibling shots", async () => {
    const result = await createPhotoDownloadUrl({
      body: { kind: "item", id: 31 },
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
      body: { kind: "dropoff", id: 12 },
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
      body: { kind: "item", id: 31 },
      user: cashier,
    });

    expect(assertCalls).toEqual([{ storeId: 3, userId: 7 }]);
  });

  it("refuses a photo that is not on file, so a guessed id gets nothing", async () => {
    await expect(
      createPhotoDownloadUrl({
        body: { kind: "pickup", id: 99 },
        user: cashier,
      })
    ).rejects.toThrow("Photo not found");
    expect(presign).not.toHaveBeenCalled();
  });

  it("reports a photo whose file has gone from the bucket, rather than signing a link to an error page", async () => {
    stored = false;
    await expect(
      createPhotoDownloadUrl({ body: { kind: "item", id: 31 }, user: cashier })
    ).rejects.toThrow("no longer in storage");
    expect(presign).not.toHaveBeenCalled();
  });
});
