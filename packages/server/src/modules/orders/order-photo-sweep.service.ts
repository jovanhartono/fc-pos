import { listReferencedPhotoKeys } from "@/modules/orders/order-photo-sweep.repository";
import { deleteStoredObject, listStoredObjects } from "@/utils/s3";

// Where every order photo is filed, whichever flow uploaded it.
const PHOTO_KEY_PREFIX = "orders/";
// The counter sends a photo up before the order line it belongs to is saved, and an operator can
// leave a batch staged while they finish serving the customer. Anything younger than this is
// still plausibly on its way to being filed, so it is left alone.
const SETTLE_HOURS = 48;
// A sweep that suddenly wants to take this many is not finding litter, it is misreading the
// database — and what it would take is the shop's only answer to a damage claim. Report the
// count and delete nothing; a person decides.
const MAX_DELETES_PER_SWEEP = 500;

const HOUR_MS = 60 * 60 * 1000;

export interface PhotoSweepResult {
  deleted: number;
  held_back: boolean;
  orphaned: number;
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

  if (orphaned.length > MAX_DELETES_PER_SWEEP) {
    return {
      deleted: 0,
      held_back: true,
      orphaned: orphaned.length,
      scanned: stored.length,
    };
  }

  for (const key of orphaned) {
    await deleteStoredObject(key);
  }

  return {
    deleted: orphaned.length,
    held_back: false,
    orphaned: orphaned.length,
    scanned: stored.length,
  };
}
