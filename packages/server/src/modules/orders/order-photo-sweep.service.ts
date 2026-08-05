import { listReferencedPhotoKeys } from "@/modules/orders/order-photo-sweep.repository";
import {
  deleteStoredObject,
  listStoredObjects,
  STORAGE_ENV_PREFIX,
} from "@/utils/s3";

// Where this environment's order photos are filed, whichever flow uploaded them. Scoping the
// listing to the environment prefix is what keeps a sweep off the other environment's evidence
// while the two share a bucket — a production photo is never a candidate for a sweep run against
// the development database, because this listing never returns it.
const PHOTO_KEY_PREFIX = `${STORAGE_ENV_PREFIX}orders/`;
// The counter sends a photo up before the order line it belongs to is saved, and an operator can
// leave a batch staged while they finish serving the customer. Anything younger than this is
// still plausibly on its way to being filed, so it is left alone. A batch left staged longer
// than this — a till tab across a weekend — loses its photos, and the confirm then fails.
const SETTLE_HOURS = 24;
// Deletes go out a few at a time rather than one after another: the bucket is in Jakarta and the
// container in Singapore, so a long backlog taken in series is minutes the cron spends held open.
// Small enough that a sweep never looks like a burst to S3.
const DELETE_CONCURRENCY = 10;

const HOUR_MS = 60 * 60 * 1000;

export interface PhotoSweepResult {
  deleted: number;
  scanned: number;
}

/**
 * Deletes order photos that no order points at.
 *
 * These exist because the counter uploads a photo the moment it is taken, before the operator
 * confirms the batch — that is what keeps a slow shop uplink off the confirm tap. A batch nobody
 * confirms, or a till tab closed mid-review, leaves the photo in the bucket with nothing filed
 * against it. The browser cannot clean that up, so this does.
 *
 * Safe to run twice, and safe to miss a run: it compares the bucket against the database each
 * time rather than working from a list of what it did last time.
 */
export async function sweepOrphanedOrderPhotos(): Promise<PhotoSweepResult> {
  const stored = await listStoredObjects(PHOTO_KEY_PREFIX);
  // Bucket first, database second. A photo filed while this is running is then certain to be in
  // the reference set, rather than looking like litter because it was saved a moment too late.
  const referenced = await listReferencedPhotoKeys();

  const settledBefore = Date.now() - SETTLE_HOURS * HOUR_MS;
  const orphaned = stored
    .filter(
      (photo) =>
        !referenced.has(photo.key) &&
        // No upload time means no way to tell litter from a photo mid-flight. Leave it.
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
