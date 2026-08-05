import { describe, expect, it } from "bun:test";
import { MAX_UPLOAD_DIMENSION, normalizeImageFile } from "./normalize-image";

interface CounterPhone {
	/** null stands for a phone with no codec for what the operator picked. */
	decodes: { height: number; width: number } | null;
	/** Types this phone's canvas can really encode. Safari has no WebP encoder. */
	encodes: string[];
	/** What the photo itself was encoded as, or null if it went up untouched. */
	encodedAs: string | null;
	/** Orientation the decode was asked for — a dropped tag ships sideways evidence. */
	decodedWith: string | undefined;
	canvasGivesUp: boolean;
}

const globals = globalThis as unknown as {
	createImageBitmap: unknown;
	document: unknown;
};

// The test harness has no DOM, so the decode and the canvas the counter phone would use are
// stood in for here — and handed back after, so no other suite inherits a fake document.
const onCounterPhone = async (
	phone: CounterPhone,
	run: () => Promise<void>,
) => {
	const previous = {
		createImageBitmap: globals.createImageBitmap,
		document: globals.document,
	};

	globals.createImageBitmap = async (
		_source: unknown,
		options?: { imageOrientation?: string },
	) => {
		phone.decodedWith = options?.imageOrientation;
		if (!phone.decodes) {
			throw new Error("undecodable");
		}
		return { close: () => undefined, ...phone.decodes };
	};
	globals.document = {
		createElement: () => {
			const canvas = {
				getContext: () => ({ drawImage: () => undefined }),
				height: 0,
				toBlob: (callback: (blob: Blob | null) => void, type: string) => {
					// A 1px canvas is the WebP support probe, not the photo — only a real encode
					// counts as having spent a lossy generation on the evidence.
					const isSupportProbe = canvas.width === 1 && canvas.height === 1;

					if (!phone.encodes.includes(type)) {
						// A real canvas quietly answers in PNG rather than refusing the type.
						callback(new Blob(["png"], { type: "image/png" }));
						return;
					}
					if (!isSupportProbe) {
						phone.encodedAs = type;
						if (phone.canvasGivesUp) {
							callback(null);
							return;
						}
					}
					callback(new Blob(["re-encoded"], { type }));
				},
				width: 0,
			};
			return canvas;
		},
	};

	try {
		await run();
	} finally {
		globals.createImageBitmap = previous.createImageBitmap;
		globals.document = previous.document;
	}
};

const basePhone = (
	decodes: { height: number; width: number } | null,
	encodes: string[],
): CounterPhone => ({
	canvasGivesUp: false,
	decodedWith: undefined,
	decodes,
	encodedAs: null,
	encodes,
});

/** An Android counter phone: Chrome encodes WebP, so shots go up as the stored artifact. */
const counterPhone = (decodes: { height: number; width: number } | null) =>
	basePhone(decodes, ["image/jpeg", "image/webp"]);

/** A till iPad: Safari encodes no WebP at any version, so shots stay JPEG. */
const counterIpad = (decodes: { height: number; width: number } | null) =>
	basePhone(decodes, ["image/jpeg"]);

const picked = (name: string, type: string, size: number) =>
	({ name, size, type }) as File;

const failureOf = async (run: () => Promise<unknown>) => {
	try {
		await run();
	} catch (error) {
		return error as Error;
	}
	return null;
};

describe("normalizeImageFile", () => {
	it("sends an iPad camera shot up untouched rather than burning a second lossy generation on the evidence", async () => {
		const ipad = counterIpad({ height: 1920, width: MAX_UPLOAD_DIMENSION });
		const shot = picked("photo-1754200000000.jpg", "image/jpeg", 2_400_000);

		await onCounterPhone(ipad, async () => {
			expect(await normalizeImageFile(shot)).toBe(shot);
			expect(ipad.encodedAs).toBeNull();
		});
	});

	it("trades an in-budget gallery JPEG for WebP where the phone can encode it, halving the upload without costing a generation", async () => {
		// The server's WebP pass is the one being replaced, not added to — so this is the same
		// two lossy passes as before over roughly half the shop-floor 4G.
		const phone = counterPhone({ height: 1920, width: MAX_UPLOAD_DIMENSION });

		await onCounterPhone(phone, async () => {
			const normalized = await normalizeImageFile(
				picked("IMG_4821.JPEG", "image/jpeg", 2_400_000),
			);

			expect(normalized.type).toBe("image/webp");
			expect(normalized.name).toBe("IMG_4821.webp");
			expect(phone.encodedAs).toBe("image/webp");
		});
	});

	it("leaves an in-budget WebP alone, because it already is what the server would have stored", async () => {
		const phone = counterPhone({ height: 1920, width: MAX_UPLOAD_DIMENSION });
		const shot = picked("photo-1754200000000.webp", "image/webp", 600_000);

		await onCounterPhone(phone, async () => {
			expect(await normalizeImageFile(shot)).toBe(shot);
			expect(phone.encodedAs).toBeNull();
		});
	});

	it("scales a 12MP drop-off photo down to the bound the server keeps anyway", async () => {
		const phone = counterPhone({ height: 3024, width: 4032 });

		await onCounterPhone(phone, async () => {
			const normalized = await normalizeImageFile(
				picked("IMG_4821.JPEG", "image/jpeg", 4_000_000),
			);

			expect(normalized.type).toBe("image/webp");
			expect(normalized.name).toBe("IMG_4821.webp");
		});
	});

	it("still scales that 12MP photo on a till iPad, just as the JPEG the server has to re-encode", async () => {
		const ipad = counterIpad({ height: 3024, width: 4032 });

		await onCounterPhone(ipad, async () => {
			const normalized = await normalizeImageFile(
				picked("IMG_4821.JPEG", "image/jpeg", 4_000_000),
			);

			expect(normalized.type).toBe("image/jpeg");
			expect(normalized.name).toBe("IMG_4821.jpg");
			expect(ipad.encodedAs).toBe("image/jpeg");
		});
	});

	it("bakes the EXIF rotation into the pixels, or a sideways-held shot uploads sideways with no tag left to fix it", async () => {
		const phone = counterPhone({ height: 3024, width: 4032 });

		await onCounterPhone(phone, async () => {
			await normalizeImageFile(
				picked("IMG_4821.JPEG", "image/jpeg", 4_000_000),
			);

			expect(phone.decodedWith).toBe("from-image");
		});
	});

	it("re-encodes a fat PNG screenshot instead of spending shop 4G on bytes the server discards", async () => {
		const phone = counterPhone({ height: 1440, width: 2560 });

		await onCounterPhone(phone, async () => {
			const normalized = await normalizeImageFile(
				picked("Screenshot 2026.08.03.png", "image/png", 9_000_000),
			);

			expect(normalized.type).toBe("image/webp");
			expect(normalized.name).toBe("Screenshot 2026.08.03.webp");
		});
	});

	it("converts an iPhone HEIC on the phone that can decode it, so S3 never holds a photo nobody can open", async () => {
		const phone = counterPhone({ height: 3024, width: 4032 });

		await onCounterPhone(phone, async () => {
			const normalized = await normalizeImageFile(
				picked("IMG_0007.HEIC", "image/heic", 1_200_000),
			);

			expect(normalized.type).toBe("image/webp");
			expect(normalized.name).toBe("IMG_0007.webp");
		});
	});

	it("rejects a HEIC on a phone with no codec for it, where the upload would be unviewable evidence", async () => {
		await onCounterPhone(counterPhone(null), async () => {
			const failure = await failureOf(() =>
				normalizeImageFile(picked("IMG_0007.HEIC", "image/heic", 1_200_000)),
			);

			expect(failure?.message).toBe("Unsupported image type");
		});
	});

	it("reports the canvas giving up separately from an unsupported format", async () => {
		const phone = counterPhone({ height: 3024, width: 4032 });
		phone.canvasGivesUp = true;

		await onCounterPhone(phone, async () => {
			const failure = await failureOf(() =>
				normalizeImageFile(picked("tear.jpg", "image/jpeg", 4_000_000)),
			);

			expect(failure?.message).toBe("Unable to process this image");
		});
	});
});
