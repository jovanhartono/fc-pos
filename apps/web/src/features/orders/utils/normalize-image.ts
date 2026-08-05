// Big enough that a 5mm stain still reads as a mark in a whole-garment shot, which is what a
// damage dispute turns on. The server keeps to the same bound — raise one and raise the other.
export const MAX_UPLOAD_DIMENSION = 2560;

// The setting the server would have used anyway, so a shot the counter encodes itself can be
// stored as it arrived: same fidelity, one lossy pass instead of two, roughly half the bytes
// over shop 4G.
const WEBP_QUALITY = 0.85;

// Safari cannot encode WebP, so iPad shots go up as JPEG and the server converts them as
// before. Kept high because this is only the trip to S3, not the stored quality — lower
// smooths away the faint discoloration a damage claim is argued from.
const JPEG_QUALITY = 0.88;

// A garment screenshot can be 10MB while still inside the dimension budget, and those bytes
// are pure shop 4G. Set above a full-size camera shot, so a live photo still passes through
// untouched rather than paying a second lossy pass to get under a byte limit.
const MAX_PASSTHROUGH_BYTES = 4_000_000;

const PASSTHROUGH_TYPES = ["image/jpeg", "image/png", "image/webp"];

const FILE_EXTENSION = /\.[^.]*$/;

export interface EncodedUpload {
	blob: Blob;
	extension: string;
	type: string;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
	new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, type, quality);
	});

// A device that cannot encode WebP hands back a PNG instead without saying so, and a PNG of a
// garment is heavier than the photo it replaced — so support gets proven before the shop uplink
// pays for it. The 1px test shot is free next to the real encode it guards.
const canEncodeWebp = async () => {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;

	try {
		const probe = await toBlob(canvas, "image/webp", WEBP_QUALITY);
		return probe?.type === "image/webp";
	} catch {
		return false;
	}
};

// The format a shot goes up in: WebP where the device can encode it, JPEG on the iPads
// that cannot. Callers that have already asked the device pass the answer in rather than
// making it prove itself twice over the same photo.
export const encodeForUpload = async (
	canvas: HTMLCanvasElement,
	supportsWebp?: boolean,
): Promise<EncodedUpload> => {
	if (supportsWebp ?? (await canEncodeWebp())) {
		const blob = await toBlob(canvas, "image/webp", WEBP_QUALITY);
		// Check the real encode, not just the probe. The silent PNG substitution is what the
		// probe exists to catch, and a device that does it for a 2560px canvas while managing a
		// 1px one would otherwise have its PNG filed — and served — labelled image/webp.
		if (blob?.type === "image/webp") {
			return { blob, extension: "webp", type: "image/webp" };
		}
	}

	const blob = await toBlob(canvas, "image/jpeg", JPEG_QUALITY);
	if (!blob) {
		throw new Error("Unable to process this image");
	}

	return { blob, extension: "jpg", type: "image/jpeg" };
};

export const normalizeImageFile = async (file: File): Promise<File> => {
	// iPhones hand over HEIC, which only their own OS can open — so it becomes a JPEG here or it
	// is refused here. Letting one through would file dispute evidence nobody can view later.
	//
	// from-image bakes the rotation in while there is still EXIF to read it from: the canvas
	// below keeps pixels and drops tags, so a sideways-held gallery shot would be filed sideways.
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
	} catch {
		throw new Error("Unsupported image type");
	}

	try {
		const longEdge = Math.max(bitmap.width, bitmap.height);
		const isInBudget =
			longEdge <= MAX_UPLOAD_DIMENSION &&
			file.size <= MAX_PASSTHROUGH_BYTES &&
			PASSTHROUGH_TYPES.includes(file.type);

		// Asked once, used twice: the budget check below and the encode further down both turn on
		// it, and a five-photo gallery pick was otherwise making the device prove itself ten
		// times over to learn one fixed fact about itself.
		const supportsWebp = await canEncodeWebp();

		// A WebP already in budget is exactly what would be stored, so it goes up untouched. A
		// JPEG or PNG gets that same free pass only where the device cannot do better —
		// elsewhere, encoding it as WebP takes the server's conversion over rather than adding a
		// second one, and halves what the shop uplink has to carry.
		if (isInBudget && (file.type === "image/webp" || !supportsWebp)) {
			return file;
		}

		const scale = Math.min(1, MAX_UPLOAD_DIMENSION / longEdge);
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);

		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Unable to process this image");
		}

		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const { blob, extension, type } = await encodeForUpload(
			canvas,
			supportsWebp,
		);

		return new File(
			[blob],
			`${file.name.replace(FILE_EXTENSION, "")}.${extension}`,
			{ type },
		);
	} finally {
		bitmap.close();
	}
};
