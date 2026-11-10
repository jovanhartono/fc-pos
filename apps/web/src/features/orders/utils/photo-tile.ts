// One size for every tile: Cloudflare counts each photo-and-size pair against the monthly free quota.
export const PHOTO_TILE_SIZE = 240;

// Past the month's free quota, onerror=redirect shows the original instead of a broken tile.
export const photoTileUrl = (url: string) => {
	// A photo still on the counter's screen is a local preview, not on the CDN yet.
	if (!url.startsWith("https://")) {
		return url;
	}

	const { origin, pathname } = new URL(url);
	return `${origin}/cdn-cgi/image/width=${PHOTO_TILE_SIZE},height=${PHOTO_TILE_SIZE},fit=cover,format=auto,onerror=redirect${pathname}`;
};
