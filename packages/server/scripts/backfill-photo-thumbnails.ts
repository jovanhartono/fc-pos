// One-off: files the .thumb beside every photo saved before thumbnails existed, so old Orders
// stop tiling from the full-size original. Skips photos that already have one, so a rerun is safe.
//
// From packages/server, with the target environment's S3_* and STORAGE_PREFIX:
//   bun run scripts/backfill-photo-thumbnails.ts
import {
  listStoredObjects,
  ORDER_PHOTO_PREFIX,
  photoKeyOf,
  thumbnailKey,
  writePhotoThumbnail,
} from "@/utils/s3";

const CONCURRENCY = 8;

console.log(`bucket ${process.env.S3_BUCKET}, prefix ${ORDER_PHOTO_PREFIX}`);

const keys = new Set(
  (await listStoredObjects(ORDER_PHOTO_PREFIX)).map(({ key }) => key)
);
const missing = [...keys].filter(
  (key) => photoKeyOf(key) === key && !keys.has(thumbnailKey(key))
);
console.log(`${keys.size} files, ${missing.length} photos without a thumbnail`);

const failed: string[] = [];
for (let index = 0; index < missing.length; index += CONCURRENCY) {
  const batch = missing.slice(index, index + CONCURRENCY);
  const results = await Promise.all(
    batch.map((key) => writePhotoThumbnail(key))
  );
  batch.forEach((key, position) => {
    if (!results[position]) {
      failed.push(key);
    }
  });
  console.log(
    `${Math.min(index + CONCURRENCY, missing.length)}/${missing.length}`
  );
}

console.log(
  `done: ${missing.length - failed.length} filed, ${failed.length} failed`
);
for (const key of failed) {
  console.log(`  failed ${key}`);
}
