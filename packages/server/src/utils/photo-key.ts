import { BadRequestException } from "@/http-exceptions";
import { PHOTO_THUMBNAIL_SUFFIX } from "@/schema/photo-thumbnail";

// Each environment has its own bucket, and its keys still carry the environment that wrote them.
// Set per Vercel environment alongside DATABASE_URL; the two must agree, or the photo sweep judges
// one environment's photos against the other's Orders and deletes them.
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

export function thumbnailKey(key: string): string {
  return `${key}${PHOTO_THUMBNAIL_SUFFIX}`;
}

// The photo a stored file belongs to: itself, or the photo a thumbnail was made from.
export function photoKeyOf(key: string): string {
  return key.endsWith(PHOTO_THUMBNAIL_SUFFIX)
    ? key.slice(0, -PHOTO_THUMBNAIL_SUFFIX.length)
    : key;
}
