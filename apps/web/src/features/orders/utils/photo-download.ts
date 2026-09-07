import { createPhotoDownloadUrl } from "@/lib/api";
import { triggerDownload } from "@/lib/download";

// The drop-off preview at checkout is still a local blob: nothing is filed for it yet, and
// the browser saves its own blob directly.
const isLocalPreview = (url: string) =>
	url.startsWith("blob:") || url.startsWith("data:");

/**
 * Saves the photo as a file. A stored photo goes via a signed link that carries its filename,
 * so the order stays on screen while the browser saves it.
 */
export async function savePhoto(imageUrl: string) {
	if (isLocalPreview(imageUrl)) {
		triggerDownload(imageUrl, "photo.webp");
		return;
	}

	const { url } = await createPhotoDownloadUrl(imageUrl);
	triggerDownload(url);
}
