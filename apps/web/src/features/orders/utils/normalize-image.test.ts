import { describe, expect, it } from "bun:test";
import { MAX_UPLOAD_DIMENSION, normalizeImageFile } from "./normalize-image";

interface CounterPhone {
	/** null stands for a phone with no codec for what the operator picked. */
	decodes: { height: number; width: number } | null;
	encodedAs: string | null;
	reEncodeTo: Blob | null;
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

	globals.createImageBitmap = async () => {
		if (!phone.decodes) {
			throw new Error("undecodable");
		}
		return { close: () => undefined, ...phone.decodes };
	};
	globals.document = {
		createElement: () => ({
			getContext: () => ({ drawImage: () => undefined }),
			height: 0,
			toBlob: (callback: (blob: Blob | null) => void, type: string) => {
				phone.encodedAs = type;
				callback(phone.reEncodeTo);
			},
			width: 0,
		}),
	};

	try {
		await run();
	} finally {
		globals.createImageBitmap = previous.createImageBitmap;
		globals.document = previous.document;
	}
};

const counterPhone = (
	decodes: { height: number; width: number } | null,
): CounterPhone => ({
	decodes,
	encodedAs: null,
	reEncodeTo: new Blob(["re-encoded"], { type: "image/jpeg" }),
});

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
	it("sends a full-size camera shot up untouched rather than burning a second lossy generation on the evidence", async () => {
		const phone = counterPhone({ height: 1920, width: MAX_UPLOAD_DIMENSION });
		const shot = picked("photo-1754200000000.jpg", "image/jpeg", 2_400_000);

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

			expect(normalized.type).toBe("image/jpeg");
			expect(normalized.name).toBe("IMG_4821.jpg");
			expect(phone.encodedAs).toBe("image/jpeg");
		});
	});

	it("re-encodes a fat PNG screenshot instead of spending shop 4G on bytes the server discards", async () => {
		const phone = counterPhone({ height: 1440, width: 2560 });

		await onCounterPhone(phone, async () => {
			const normalized = await normalizeImageFile(
				picked("Screenshot 2026.08.03.png", "image/png", 9_000_000),
			);

			expect(normalized.type).toBe("image/jpeg");
			expect(normalized.name).toBe("Screenshot 2026.08.03.jpg");
		});
	});

	it("converts an iPhone HEIC on the phone that can decode it, so S3 never holds a photo nobody can open", async () => {
		const phone = counterPhone({ height: 3024, width: 4032 });

		await onCounterPhone(phone, async () => {
			const normalized = await normalizeImageFile(
				picked("IMG_0007.HEIC", "image/heic", 1_200_000),
			);

			expect(normalized.type).toBe("image/jpeg");
			expect(normalized.name).toBe("IMG_0007.jpg");
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
		phone.reEncodeTo = null;

		await onCounterPhone(phone, async () => {
			const failure = await failureOf(() =>
				normalizeImageFile(picked("tear.jpg", "image/jpeg", 4_000_000)),
			);

			expect(failure?.message).toBe("Unable to process this image");
		});
	});
});
