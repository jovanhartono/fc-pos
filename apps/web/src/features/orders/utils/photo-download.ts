import { createPhotoDownloadUrl, type PhotoDownloadRef } from "@/lib/api";
import { triggerDownload } from "@/lib/download";

/**
 * Saves the photo as a file. A stored photo goes via a signed link that carries its filename,
 * so the order stays on screen while the browser saves it. A preview nothing is filed for yet
 * (the drop-off shot at checkout) is the browser's own blob, and it saves that directly.
 */
export async function savePhoto(
	download: PhotoDownloadRef | undefined,
	imageUrl: string,
) {
	if (!download) {
		triggerDownload(imageUrl, "photo.webp");
		return;
	}

	const { url } = await createPhotoDownloadUrl(download);
	triggerDownload(url);
}
