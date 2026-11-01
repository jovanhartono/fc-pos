// One size per kind of photo: Cloudflare counts each photo-and-size pair against the monthly free quota.
export const ITEM_PHOTO_TILE_SIZE = 160;
export const ATTACHMENT_TILE_SIZE = 240;

type TileSize = typeof ITEM_PHOTO_TILE_SIZE | typeof ATTACHMENT_TILE_SIZE;

// Past the month's free quota, onerror=redirect shows the original instead of a broken tile.
export const photoTileUrl = (url: string, size: TileSize) => {
	// A photo still on the counter's screen is a local preview, not on the CDN yet.
	if (!url.startsWith("https://")) {
		return url;
	}

	const { origin, pathname } = new URL(url);
	return `${origin}/cdn-cgi/image/width=${size},height=${size},fit=cover,format=auto,onerror=redirect${pathname}`;
};
