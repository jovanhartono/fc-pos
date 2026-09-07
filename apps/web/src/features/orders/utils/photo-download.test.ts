import { describe, expect, it, mock } from "bun:test";

const asked: string[] = [];

// Stand in for the API: the signed link the server would hand back for a stored photo.
mock.module("@/lib/api", () => ({
	createPhotoDownloadUrl: (imageUrl: string) => {
		asked.push(imageUrl);
		return Promise.resolve({ url: "https://s3.example/signed" });
	},
}));

const { savePhoto } = await import("./photo-download");

const globals = globalThis as unknown as { document: unknown };

// Records the link the browser was pointed at, since a real click here would be a download.
// The fake document is handed back after, so no other suite inherits it.
const withFakeDocument = async (
	run: () => Promise<void>,
): Promise<{ href: string; download: string }[]> => {
	const clicks: { href: string; download: string }[] = [];
	const previous = globals.document;
	globals.document = {
		body: { appendChild: () => undefined },
		createElement: () => {
			const link = {
				download: "",
				href: "",
				click: () => clicks.push({ href: link.href, download: link.download }),
				remove: () => undefined,
			};
			return link;
		},
	};
	try {
		await run();
	} finally {
		globals.document = previous;
	}
	return clicks;
};

describe("savePhoto", () => {
	it("saves a stored photo through the signed link, which names the file itself", async () => {
		asked.length = 0;
		const clicks = await withFakeDocument(() =>
			savePhoto("https://cdn.fresclean.id/prod/orders/1/items/2/abc"),
		);

		expect(asked).toEqual([
			"https://cdn.fresclean.id/prod/orders/1/items/2/abc",
		]);
		expect(clicks).toEqual([
			{ href: "https://s3.example/signed", download: "" },
		]);
	});

	it("saves the drop-off preview at checkout straight from the browser, with no photo on file to ask about", async () => {
		asked.length = 0;
		const clicks = await withFakeDocument(() =>
			savePhoto("blob:http://localhost/preview"),
		);

		expect(asked).toEqual([]);
		expect(clicks).toEqual([
			{ href: "blob:http://localhost/preview", download: "photo.webp" },
		]);
	});
});
