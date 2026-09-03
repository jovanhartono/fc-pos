import { s3 } from "bun";
import { BadRequestException } from "@/http-exceptions";

const DEFAULT_PRESIGNED_EXPIRES_SECONDS = 300;
// 2560 on the long edge keeps a 5mm stain reading as a mark rather than a smudge in a
// whole-garment shot, which is what a damage dispute turns on. The counter app scales to the
// same bound, so this resize only bites on bytes that skipped it — a stale bundle, or anything
// else PUTting to a presigned URL. Raise one bound without the other and they stop matching.
const MAX_IMAGE_DIMENSION = 2560;
// Mirrors the counter app's setting, which is what lets a shot it already encoded be stored as
// it arrived. Change one without the other and every upload pays for a conversion again.
const WEBP_QUALITY = 85;
// Enough of the object to hold an image header, which is all the check below reads. Still a
// rounding error next to the full download it replaces.
const METADATA_PROBE_BYTES = 65_536;
// Mirrors MAX_PASSTHROUGH_BYTES in apps/web normalize-image.ts. Dimensions alone do not bound
// weight: a lossless WebP inside the pixel budget can run to tens of MB, and keeping it verbatim
// would put that on the CDN and on every operator opening the gallery. The conversion below
// lands a 2560px shot in a few hundred KB, so anything heavier than this is worth converting
// however well-formed its header is.
const MAX_PASSTHROUGH_BYTES = 4_000_000;

// Dev and production share one bucket, so every key is filed under the environment that wrote
// it. What this buys: the photo sweep lists only its own environment's prefix, and so can never
// weigh a production dispute photo against a development database that has never heard of the
// order it was filed under — and delete it. Derived from the same flag that picks the database
// in db/index.ts, so the two halves cannot disagree about which environment this is.
export const STORAGE_ENV_PREFIX =
  process.env.NODE_ENV === "production" ? "prod/" : "dev/";

// Most shots now arrive already in the format and size we store, so a header-sized read is
// enough to keep them exactly as they came — sparing a full download, a conversion and a second
// lossy pass over the faint mark a dispute is argued from. iPad shots still arrive as JPEG and
// fall through to the conversion below, as does anything else PUTting to a presigned URL, which
// is why that branch stays as strict as it was.
//
// A header nobody can read is not a verdict on the photo: it just means convert. Only the
// conversion is allowed to reject.
async function isAlreadyOptimized(
  file: ReturnType<typeof s3.file>
): Promise<boolean> {
  try {
    // One round trip, not two: the header says what the bytes are, the stat says how many of
    // them there are, and a passthrough needs both to be in budget.
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
  // biome-ignore lint/performance/useTopLevelRegex: <i dont care>
  const normalizedPath = path.replace(/^\/+/, "");
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

export interface StoredObject {
  key: string;
  lastModified?: string;
}

// Every stored object under a prefix, following the pages to the end. A shop a year into
// trading holds far more than the 1000 keys one listing returns, and a caller that only saw
// the first page would treat the rest as if the bucket did not hold them.
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

export async function optimizeUploadedImage(key: string): Promise<void> {
  const file = s3.file(key);

  if (await isAlreadyOptimized(file)) {
    return;
  }

  let optimized: Uint8Array;
  try {
    optimized = await file
      .image()
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .bytes();
  } catch (error) {
    // Every stored object has to be browser-renderable WebP. Keeping an
    // undecodable original instead meant a drop-off photo opened as a broken
    // image for every operator not on Safari — the evidence was silently gone
    // by the time a customer claimed the tear was ours. Note HEIC only reaches
    // this branch where no OS codec exists, which is the Linux container we
    // deploy to: the same upload converts fine on a macOS dev machine via
    // ImageIO, so a local success is not evidence HEIC is safe to accept again.
    if ((error as { code?: string }).code?.startsWith("ERR_IMAGE_")) {
      throw new BadRequestException("Uploaded file is not a valid image", {
        cause: error,
      });
    }
    // S3/network/other infra fault — propagate, don't mislabel as a bad image.
    throw error;
  }

  await file.write(optimized, { type: "image/webp" });
}
