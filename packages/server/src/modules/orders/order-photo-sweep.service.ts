import { listReferencedPhotoKeys } from "@/modules/orders/order-photo.repository";
import {
  deleteStoredObject,
  listStoredObjects,
  STORAGE_ENV_PREFIX,
} from "@/utils/s3";

// Dev and prod share the bucket; this prefix keeps a dev sweep off prod's photos.
const PHOTO_KEY_PREFIX = `${STORAGE_ENV_PREFIX}orders/`;
// A cashier can leave a batch unconfirmed while serving the Customer. A batch left
// longer than this, like a POS open over a weekend, loses its photos.
const SETTLE_HOURS = 24;
// The bucket is in Jakarta and the API in Singapore, so one-by-one deletes of a
// backlog would hold the cron open for minutes.
const DELETE_CONCURRENCY = 10;

const HOUR_MS = 60 * 60 * 1000;

export interface PhotoSweepResult {
  deleted: number;
  scanned: number;
}

/**
 * Deletes order photos no Order points at. The counter uploads each photo before
 * the batch is confirmed, so an abandoned batch leaves files behind.
 * Safe to run twice or miss a run: it compares bucket and database every time.
 */
export async function sweepOrphanedOrderPhotos(): Promise<PhotoSweepResult> {
  const stored = await listStoredObjects(PHOTO_KEY_PREFIX);
  // Bucket first, database second, so a photo filed mid-run is never taken for
  // an abandoned one.
  const referenced = await listReferencedPhotoKeys();

  const settledBefore = Date.now() - SETTLE_HOURS * HOUR_MS;
  const orphaned = stored
    .filter(
      (photo) =>
        !referenced.has(photo.key) &&
        // No upload time, so no way to tell it is abandoned. Leave it.
        photo.lastModified !== undefined &&
        Date.parse(photo.lastModified) < settledBefore
    )
    .map((photo) => photo.key);

  for (let index = 0; index < orphaned.length; index += DELETE_CONCURRENCY) {
    await Promise.all(
      orphaned
        .slice(index, index + DELETE_CONCURRENCY)
        .map((key) => deleteStoredObject(key))
    );
  }

  return { deleted: orphaned.length, scanned: stored.length };
}
