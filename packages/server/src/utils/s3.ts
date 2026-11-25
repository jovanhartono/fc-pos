import { s3 } from "bun";

import { BadRequestException } from "@/http-exceptions";
import {
  PHOTO_MAX_DIMENSION,
  PHOTO_MAX_PASSTHROUGH_BYTES,
  PHOTO_WEBP_QUALITY,
} from "@/schema/photo-encoding";
import { PHOTO_TILE_SIZE } from "@/schema/photo-thumbnail";
import { thumbnailKey } from "@/utils/photo-key";
import { reportError } from "@/utils/report-error";

const DEFAULT_PRESIGNED_EXPIRES_SECONDS = 300;
const METADATA_PROBE_BYTES = 65_536;
// Every Order screen tiles its photos; a small copy filed beside each one keeps those tiles off
// Cloudflare's monthly free transformations, which ran out within a week.
const THUMBNAIL_QUALITY = 75;

// Keeping a counter shot as it came spares a second lossy pass over the faint mark a dispute
// is argued from. An unreadable header just means convert; only the conversion may reject.
const isAlreadyOptimized = async (
  file: ReturnType<typeof s3.file>
): Promise<boolean> => {
  try {
    const [header, stats] = await Promise.all([
      file.slice(0, METADATA_PROBE_BYTES).image().metadata(),
      file.stat(),
    ]);

    return (
      header.format === "webp" &&
      Math.max(header.width, header.height) <= PHOTO_MAX_DIMENSION &&
      stats.size <= PHOTO_MAX_PASSTHROUGH_BYTES
    );
  } catch {
    return false;
  }
};

const LEADING_SLASHES = /^\/+/u;

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

// Photo flows go through presignPhotoUpload (utils/photo-upload.ts).
export const createPresignedUploadUrl = ({
  contentType,
  key,
}: CreatePresignedUploadInput) => {
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
};

// A link to a missing file swaps the Order screen for R2's error page, so check first. An
// outage is not a missing photo and is thrown as it is.
export const isStoredObjectReadable = async (key: string): Promise<boolean> => {
  try {
    await s3.file(key).slice(0, 1).bytes();
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "NoSuchKey") {
      return false;
    }
    throw error;
  }
};

// A link that saves the photo as a file instead of showing it, straight from the R2 bucket — so the CDN
// needs no CORS and no bytes pass through this server.
export const createPresignedDownloadUrl = ({
  key,
  filename,
}: {
  key: string;
  filename: string;
}) =>
  s3.presign(key, {
    expiresIn: DEFAULT_PRESIGNED_EXPIRES_SECONDS,
    method: "GET",
    contentDisposition: `attachment; filename="${filename}"`,
  });

export interface StoredObject {
  key: string;
  lastModified?: string;
}

// One listing returns 1000 keys; a caller seeing only the first page would treat the rest of
// the shop's photos as missing.
export const listStoredObjects = async (
  prefix: string
): Promise<StoredObject[]> => {
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
};

export const deleteStoredObject = (key: string): Promise<void> =>
  s3.delete(key);

// A photo whose thumbnail fails still tiles from the original, so the save goes on without it.
// `source` is the photo already in memory, when the save just encoded it.
export const writePhotoThumbnail = async (
  key: string,
  source: Bun.Image = s3.file(key).image()
): Promise<boolean> => {
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
};

const encodeStoredWebp = async (
  file: ReturnType<typeof s3.file>
): Promise<Uint8Array> => {
  try {
    return await file
      .image()
      .resize(PHOTO_MAX_DIMENSION, PHOTO_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: PHOTO_WEBP_QUALITY })
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
};

// Rewrites whatever key it is given: call it through acceptPhotoUpload, which
// first checks the key belongs to the Order, or one Order could overwrite another's.
export const optimizeUploadedImage = async (key: string): Promise<void> => {
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
};
