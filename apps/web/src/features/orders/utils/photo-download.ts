import { createPhotoDownloadUrl } from "@/features/orders/api";
import type { PhotoDownloadRef } from "@/features/orders/api";
import { triggerDownload } from "@/lib/download";

/**
 * A stored photo saves via a signed link so the Order stays on screen; one not saved yet
 * (the Drop-off photo at checkout) saves its own blob.
 */
export const savePhoto = async (
  download: PhotoDownloadRef | undefined,
  imageUrl: string
) => {
  if (!download) {
    triggerDownload(imageUrl, "photo.webp");
    return;
  }

  const { url } = await createPhotoDownloadUrl(download);
  triggerDownload(url);
};
