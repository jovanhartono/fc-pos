import { describe, expect, it } from "bun:test";
import { originalPhotoUrl, photoTileUrl } from "./photo-tile";

describe("photoTileUrl", () => {
	it("points at the small copy the server filed beside a stored photo", () => {
		expect(
			photoTileUrl(
				"https://cdn.fresclean.id/prod/orders/1145/items/2076/e31a37e7",
			),
		).toBe(
			"https://cdn.fresclean.id/prod/orders/1145/items/2076/e31a37e7.thumb",
		);
	});

	it("leaves a photo still on the counter's screen alone", () => {
		const preview = "blob:https://pos.fresclean.id/5f1c";
		expect(photoTileUrl(preview)).toBe(preview);
	});
});

describe("originalPhotoUrl", () => {
	it("falls back to the original when a photo has no thumbnail", () => {
		expect(
			originalPhotoUrl(
				"https://cdn.fresclean.id/prod/orders/1145/items/2076/e31a37e7.thumb",
			),
		).toBe("https://cdn.fresclean.id/prod/orders/1145/items/2076/e31a37e7");
	});

	it("gives up once the original has failed too, instead of looping", () => {
		expect(
			originalPhotoUrl(
				"https://cdn.fresclean.id/prod/orders/1145/items/2076/e31a37e7",
			),
		).toBeNull();
	});
});
