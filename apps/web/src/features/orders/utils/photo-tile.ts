import { PHOTO_THUMBNAIL_SUFFIX, PHOTO_TILE_SIZE } from "@fresclean/api/rules";
import type { SyntheticEvent } from "react";

export { PHOTO_TILE_SIZE };

// The small copy the server files beside each photo when it's saved.
export const photoTileUrl = (url: string) => {
	// A photo still on the counter's screen is a local preview, not on the CDN yet.
	if (!url.startsWith("https://")) {
		return url;
	}

	return `${url}${PHOTO_THUMBNAIL_SUFFIX}`;
};

// A photo whose thumbnail failed on save tiles from the original: heavier, never broken.
export const originalPhotoUrl = (tileUrl: string) =>
	tileUrl.endsWith(PHOTO_THUMBNAIL_SUFFIX)
		? tileUrl.slice(0, -PHOTO_THUMBNAIL_SUFFIX.length)
		: null;

export const handleTileError = (event: SyntheticEvent<HTMLImageElement>) => {
	const original = originalPhotoUrl(event.currentTarget.src);
	if (original) {
		event.currentTarget.src = original;
	}
};
