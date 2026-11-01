import { describe, expect, it } from "bun:test";
import { photoTileUrl } from "./photo-tile";

describe("photoTileUrl", () => {
	it("asks Cloudflare for a small copy of a stored photo", () => {
		expect(
			photoTileUrl(
				"https://cdn.fresclean.id/prod/orders/1145/items/2076/e31a37e7",
				160,
			),
		).toBe(
			"https://cdn.fresclean.id/cdn-cgi/image/width=160,height=160,fit=cover,format=auto,onerror=redirect/prod/orders/1145/items/2076/e31a37e7",
		);
	});

	it("leaves a photo still on the counter's screen alone", () => {
		const preview = "blob:https://pos.fresclean.id/5f1c";
		expect(photoTileUrl(preview, 160)).toBe(preview);
	});
});
