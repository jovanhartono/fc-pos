import { s3 } from "bun";
import { BadRequestException } from "@/errors";

const DEFAULT_PRESIGNED_EXPIRES_SECONDS = 300;
// 2560 on the long edge keeps a 5mm stain reading as a mark rather than a smudge across a
// whole-garment frame when a customer disputes the damage; q80 smoothed away exactly the
// faint low-contrast discoloration those disputes turn on. The counter app already scales
// its uploads to the same bound (MAX_UPLOAD_DIMENSION in apps/web normalize-image.ts), so
// the resize below only bites on bytes that skipped it — a counter phone still running a
// stale bundle, or anything else PUTting to a presigned URL. Raise one bound without the
// other and they stop matching.
const MAX_IMAGE_DIMENSION = 2560;
const WEBP_QUALITY = 85;

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

export async function optimizeUploadedImage(key: string): Promise<void> {
  const file = s3.file(key);

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
      throw new BadRequestException("Uploaded file is not a valid image");
    }
    // S3/network/other infra fault — propagate, don't mislabel as a bad image.
    throw error;
  }

  await file.write(optimized, { type: "image/webp" });
}
