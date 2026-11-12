import { s3 } from "bun";
import { BadRequestException } from "@/http-exceptions";
import {
  PHOTO_THUMBNAIL_SUFFIX,
  PHOTO_TILE_SIZE,
} from "@/schema/photo-thumbnail";
import { reportError } from "@/utils/report-error";

const DEFAULT_PRESIGNED_EXPIRES_SECONDS = 300;
// 2560px keeps a 5mm stain visible in a whole-Item shot, which a damage dispute turns on.
// The counter app scales to the same bound; raise one without the other and they stop matching.
const MAX_IMAGE_DIMENSION = 2560;
// Matches the counter app, so its shots are stored as they arrive. Change one without the other
// and every upload is converted again.
const WEBP_QUALITY = 85;
const METADATA_PROBE_BYTES = 65_536;
// Mirrors apps/web normalize-image.ts. A lossless WebP within 2560px can run to tens of MB and
// load slowly for every operator opening the gallery, so anything heavier is converted.
const MAX_PASSTHROUGH_BYTES = 4_000_000;
// Every Order screen tiles its photos; a small copy filed beside each one keeps those tiles off
// Cloudflare's monthly free transformations, which ran out within a week.
const THUMBNAIL_QUALITY = 75;

// Dev and production share one bucket. Without the prefix, the photo sweep could check a
// production dispute photo against the dev database, find no Order for it, and delete it.
// Set per Vercel environment alongside DATABASE_URL; the two must agree.
const rawStoragePrefix = process.env.STORAGE_PREFIX;
if (!(rawStoragePrefix && /^(dev|prod)\/$/.test(rawStoragePrefix))) {
  throw new Error('STORAGE_PREFIX must be "dev/" or "prod/"');
}
export const STORAGE_ENV_PREFIX = rawStoragePrefix;
export const ORDER_PHOTO_PREFIX = `${STORAGE_ENV_PREFIX}orders/`;

export type PhotoScope =
  | { itemId: number; kind: "item"; orderId: number }
  | { kind: "dropoff" | "pickup"; orderId: number }
  | { kind: "avatar"; userId: number };

function photoScopePrefix(scope: PhotoScope): string {
  // Outside orders/, so the nightly sweep never judges a staff photo against Orders.
  if (scope.kind === "avatar") {
    return `${STORAGE_ENV_PREFIX}users/${scope.userId}/avatar/`;
  }
  const base = `${ORDER_PHOTO_PREFIX}${scope.orderId}/`;
  return scope.kind === "item"
    ? `${base}items/${scope.itemId}/`
    : `${base}${scope.kind}/`;
}

export function newPhotoKey(scope: PhotoScope): string {
  return `${photoScopePrefix(scope)}${crypto.randomUUID()}`;
}

// A stale tab or a replayed request can hand back a path for another Order's
// folder, another Item's, a `..` escape out of it, or a thumbnail's, which the
// sweep would then delete as a thumbnail whose photo is gone.
export function assertPhotoKeyUnder(path: string, scope: PhotoScope): void {
  const prefix = photoScopePrefix(scope);
  if (!path.startsWith(prefix)) {
    throw new BadRequestException("Invalid image path");
  }

  const remainder = path.slice(prefix.length);
  if (
    remainder.length === 0 ||
    remainder.includes("/") ||
    remainder === "." ||
    remainder === ".." ||
    remainder.endsWith(PHOTO_THUMBNAIL_SUFFIX)
  ) {
    throw new BadRequestException("Invalid image path");
  }
}

// Keeping a counter shot as it came spares a second lossy pass over the faint mark a dispute
// is argued from. An unreadable header just means convert; only the conversion may reject.
async function isAlreadyOptimized(
  file: ReturnType<typeof s3.file>
): Promise<boolean> {
  try {
    const [header, stats] = await Promise.all([
      file.slice(0, METADATA_PROBE_BYTES).image().metadata(),
      file.stat(),
    ]);

    return (
      header.format === "webp" &&
      Math.max(header.width, header.height) <= MAX_IMAGE_DIMENSION &&
      stats.size <= MAX_PASSTHROUGH_BYTES
    );
  } catch {
    return false;
  }
}

const LEADING_SLASHES = /^\/+/;

export function buildMediaUrl(path: string): string;
export function buildMediaUrl(path: null | undefined): null;
export function buildMediaUrl(path: string | null | undefined): string | null;
export function buildMediaUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  const base = process.env.CDN_BASE_URL;
  if (!base) {
    throw new Error("Missing CDN_BASE_URL configuration");
  }

  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.replace(LEADING_SLASHES, "");
  return new URL(normalizedPath, normalizedBase).toString();
}

interface CreatePresignedUploadInput {
  contentType: string;
  key: string;
}

export function createPresignedUploadUrl({
  contentType,
  key,
}: CreatePresignedUploadInput) {
  const uploadUrl = s3.presign(key, {
    expiresIn: DEFAULT_PRESIGNED_EXPIRES_SECONDS,
    type: contentType,
    method: "PUT",
  });

  return {
    upload_url: uploadUrl,
    key,
    expires_in_seconds: DEFAULT_PRESIGNED_EXPIRES_SECONDS,
  };
}

// A link to a missing file swaps the Order screen for S3's error page, so check first. An
// outage is not a missing photo and is thrown as it is.
export async function isStoredObjectReadable(key: string): Promise<boolean> {
  try {
    await s3.file(key).slice(0, 1).bytes();
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "NoSuchKey") {
      return false;
    }
    throw error;
  }
}

// A link that saves the photo as a file instead of showing it, straight from S3 — so the CDN
// needs no CORS and no bytes pass through this server.
export function createPresignedDownloadUrl({
  key,
  filename,
}: {
  key: string;
  filename: string;
}) {
  return s3.presign(key, {
    expiresIn: DEFAULT_PRESIGNED_EXPIRES_SECONDS,
    method: "GET",
    contentDisposition: `attachment; filename="${filename}"`,
  });
}

export interface StoredObject {
  key: string;
  lastModified?: string;
}

// One listing returns 1000 keys; a caller seeing only the first page would treat the rest of
// the shop's photos as missing.
export async function listStoredObjects(
  prefix: string
): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await s3.list({ prefix, continuationToken });

    for (const object of page.contents ?? []) {
      objects.push({ key: object.key, lastModified: object.lastModified });
    }

    continuationToken = page.isTruncated
      ? page.nextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

export function deleteStoredObject(key: string): Promise<void> {
  return s3.delete(key);
}

export function thumbnailKey(key: string): string {
  return `${key}${PHOTO_THUMBNAIL_SUFFIX}`;
}

// The photo a stored file belongs to: itself, or the photo a thumbnail was made from.
export function photoKeyOf(key: string): string {
  return key.endsWith(PHOTO_THUMBNAIL_SUFFIX)
    ? key.slice(0, -PHOTO_THUMBNAIL_SUFFIX.length)
    : key;
}

// A photo whose thumbnail fails still tiles from the original, so the save goes on without it.
// `source` is the photo already in memory, when the save just encoded it.
export async function writePhotoThumbnail(
  key: string,
  source: Bun.Image = s3.file(key).image()
): Promise<boolean> {
  try {
    const thumbnail = await source
      .resize(PHOTO_TILE_SIZE, PHOTO_TILE_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: THUMBNAIL_QUALITY })
      .bytes();
    await s3.file(thumbnailKey(key)).write(thumbnail, { type: "image/webp" });
    return true;
  } catch (error) {
    await reportError(error);
    return false;
  }
}

export async function optimizeUploadedImage(key: string): Promise<void> {
  const file = s3.file(key);

  if (await isAlreadyOptimized(file)) {
    await writePhotoThumbnail(key);
    return;
  }

  const encoded = await encodeStoredWebp(file);
  await Promise.all([
    file.write(encoded, { type: "image/webp" }),
    writePhotoThumbnail(key, new Bun.Image(encoded)),
  ]);
}

async function encodeStoredWebp(
  file: ReturnType<typeof s3.file>
): Promise<Uint8Array> {
  try {
    return await file
      .image()
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .bytes();
  } catch (error) {
    // Keeping an undecodable original left a Drop-off photo broken outside Safari, so the
    // evidence was gone when a Customer claimed the tear was ours. HEIC converts on a macOS
    // laptop but fails on the Linux deploy, so a local success proves nothing.
    if ((error as { code?: string }).code?.startsWith("ERR_IMAGE_")) {
      throw new BadRequestException("Uploaded file is not a valid image", {
        cause: error,
      });
    }
    throw error;
  }
}
