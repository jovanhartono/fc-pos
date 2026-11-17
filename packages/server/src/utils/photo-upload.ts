import { assertPhotoKeyUnder, newPhotoKey } from "@/utils/photo-key";
import type { PhotoScope } from "@/utils/photo-key";
import { createPresignedUploadUrl, optimizeUploadedImage } from "@/utils/s3";

export const presignPhotoUpload = (scope: PhotoScope, contentType: string) =>
  createPresignedUploadUrl({ contentType, key: newPhotoKey(scope) });

// The re-encode rewrites whatever key it is given, so checking the path first is what stops a
// client-supplied path from overwriting another Order's evidence.
export const acceptPhotoUpload = async (
  scope: PhotoScope,
  path: string
): Promise<void> => {
  assertPhotoKeyUnder(path, scope);
  await optimizeUploadedImage(path);
};
