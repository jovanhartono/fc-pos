// The sweep is the only thing that deletes a customer's photo without a person asking it to, so
// what these guard is mostly restraint: it takes the litter an abandoned batch leaves behind, and
// nothing that a dispute might still be argued from.

import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { s3 } from "bun";

const HOUR_MS = 60 * 60 * 1000;
const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * HOUR_MS).toISOString();

let referenced = new Set<string>();

// Stand in for the repository so the sweep's judgement can be exercised without a database.
mock.module("@/modules/orders/order-photo-sweep.repository", () => ({
  listReferencedPhotoKeys: () => Promise.resolve(referenced),
}));

const { sweepOrphanedOrderPhotos } = await import(
  "@/modules/orders/order-photo-sweep.service"
);
const { STORAGE_ENV_PREFIX } = await import("@/utils/s3");

// Where this environment files its photos, and where a test's keys have to live to be seen.
const own = (suffix: string) => `${STORAGE_ENV_PREFIX}orders/${suffix}`;

interface StoredRow {
  key: string;
  lastModified?: string;
}

/**
 * Stands in for the bucket, paging the way S3 does once a shop has more than a page of photos,
 * and honouring the requested prefix the way S3 does — which is what keeps the other
 * environment's photos out of a sweep's reach while the two share a bucket.
 */
const stubBucket = (objects: StoredRow[], pageSize = 1000) => {
  const calls = {
    deleted: [] as string[],
    listings: 0,
    prefixes: [] as string[],
  };

  const listSpy = spyOn(s3, "list").mockImplementation(((
    input?: {
      continuationToken?: string;
      prefix?: string;
    } | null
  ) => {
    const prefix = input?.prefix ?? "";
    calls.prefixes.push(prefix);
    const visible = objects.filter((object) => object.key.startsWith(prefix));
    const start = Number(input?.continuationToken ?? 0);
    const page = visible.slice(start, start + pageSize);
    const next = start + page.length;
    calls.listings += 1;

    return Promise.resolve({
      contents: page,
      isTruncated: next < visible.length,
      nextContinuationToken: String(next),
    });
  }) as never);

  const deleteSpy = spyOn(s3, "delete").mockImplementation(((key: string) => {
    calls.deleted.push(key);
    return Promise.resolve();
  }) as never);

  return {
    calls,
    restore: () => {
      listSpy.mockRestore();
      deleteSpy.mockRestore();
    },
  };
};

describe("sweepOrphanedOrderPhotos", () => {
  let restore = () => {
    // replaced per test
  };

  afterEach(() => {
    restore();
    referenced = new Set();
  });

  it("takes the photo from a batch the operator never confirmed, which no order points at", async () => {
    const { calls, restore: undo } = stubBucket([
      { key: own("812/services/9/abandoned"), lastModified: hoursAgo(72) },
    ]);
    restore = undo;

    expect(await sweepOrphanedOrderPhotos()).toEqual({
      deleted: 1,
      scanned: 1,
    });
    expect(calls.deleted).toEqual([own("812/services/9/abandoned")]);
  });

  it("never reaches the other environment's photos, which sit in the same bucket under their own prefix", async () => {
    const { calls, restore: undo } = stubBucket([
      {
        key: "prod/orders/1/dropoff/other-environment",
        lastModified: hoursAgo(72),
      },
      {
        key: "orders/1/dropoff/before-the-prefixes",
        lastModified: hoursAgo(72),
      },
    ]);
    restore = undo;

    // Not "considered and spared" — never listed. The scan count is what proves it.
    expect(await sweepOrphanedOrderPhotos()).toMatchObject({
      deleted: 0,
      scanned: 0,
    });
    expect(calls.prefixes).toEqual([`${STORAGE_ENV_PREFIX}orders/`]);
    expect(calls.deleted).toEqual([]);
  });

  it("keeps a photo an order still points at, however old the order is", async () => {
    referenced = new Set([own("812/dropoff/filed")]);
    const { calls, restore: undo } = stubBucket([
      { key: own("812/dropoff/filed"), lastModified: hoursAgo(9000) },
    ]);
    restore = undo;

    expect(await sweepOrphanedOrderPhotos()).toMatchObject({
      deleted: 0,
    });
    expect(calls.deleted).toEqual([]);
  });

  it("leaves a shot taken an hour ago alone, so a batch still being reviewed is not swept out from under the operator", async () => {
    const { calls, restore: undo } = stubBucket([
      { key: own("812/services/9/still-staged"), lastModified: hoursAgo(1) },
    ]);
    restore = undo;

    expect(await sweepOrphanedOrderPhotos()).toMatchObject({
      deleted: 0,
      scanned: 1,
    });
    expect(calls.deleted).toEqual([]);
  });

  it("leaves a photo alone when the bucket cannot say when it arrived", async () => {
    const { calls, restore: undo } = stubBucket([
      { key: own("812/pickup/undated") },
    ]);
    restore = undo;

    expect(await sweepOrphanedOrderPhotos()).toMatchObject({ deleted: 0 });
    expect(calls.deleted).toEqual([]);
  });

  it("takes a photo staged a day and a half ago, which is the window the shop settled on", async () => {
    const { calls, restore: undo } = stubBucket([
      {
        key: own("812/services/9/staged-yesterday"),
        lastModified: hoursAgo(36),
      },
    ]);
    restore = undo;

    expect(await sweepOrphanedOrderPhotos()).toMatchObject({ deleted: 1 });
    expect(calls.deleted).toEqual([own("812/services/9/staged-yesterday")]);
  });

  it("clears a backlog in one pass, however long it has been left to build", async () => {
    const litter = Array.from({ length: 501 }, (_unused, index) => ({
      key: own(`812/services/9/photo-${index}`),
      lastModified: hoursAgo(72),
    }));
    const { calls, restore: undo } = stubBucket(litter);
    restore = undo;

    expect(await sweepOrphanedOrderPhotos()).toEqual({
      deleted: 501,
      scanned: 501,
    });
    expect(calls.deleted).toHaveLength(501);
  });

  it("reads the listing to the end, so photos past the first page are not judged as if the bucket held only the first", async () => {
    referenced = new Set([own("812/dropoff/filed")]);
    const { calls, restore: undo } = stubBucket(
      [
        { key: own("812/dropoff/filed"), lastModified: hoursAgo(72) },
        { key: own("813/dropoff/abandoned"), lastModified: hoursAgo(72) },
        { key: own("814/dropoff/abandoned"), lastModified: hoursAgo(72) },
      ],
      2
    );
    restore = undo;

    expect(await sweepOrphanedOrderPhotos()).toMatchObject({
      deleted: 2,
      scanned: 3,
    });
    expect(calls.listings).toBe(2);
    expect(calls.deleted).toEqual([
      own("813/dropoff/abandoned"),
      own("814/dropoff/abandoned"),
    ]);
  });
});
