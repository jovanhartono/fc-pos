// Big enough that a 5mm stain still shows in a photo of the whole Item, what a Complaint
// turns on. The server keeps the same bound; raise both together.
export const MAX_UPLOAD_DIMENSION = 2560;

// The server's own setting, so a photo encoded here is stored as it arrived: one lossy
// pass, about half the bytes over shop 4G.
const WEBP_QUALITY = 0.85;

// Safari can't encode WebP, so iPad photos go up as JPEG; kept high so the faint
// discoloration a Complaint is argued from survives the trip.
const JPEG_QUALITY = 0.88;

// A screenshot can be 10MB inside the size budget. Set above a full camera photo, so
// a live photo still passes through untouched.
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

// A device that can't encode WebP silently hands back a heavier PNG, so prove support
// before the shop uplink pays for it.
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

// WebP where the device can encode it, JPEG on the iPads that can't.
export const encodeForUpload = async (
	canvas: HTMLCanvasElement,
	supportsWebp?: boolean,
): Promise<EncodedUpload> => {
	if (supportsWebp ?? (await canEncodeWebp())) {
		const blob = await toBlob(canvas, "image/webp", WEBP_QUALITY);
		// Check the real encode too: a device may manage WebP at 1px but swap in a PNG at
		// 2560px, which would be stored labelled image/webp.
		if (blob?.type === "image/webp") {
			return { blob, extension: "webp", type: "image/webp" };
		}
	}

	const blob = await toBlob(canvas, "image/jpeg", JPEG_QUALITY);
	if (!blob) {
		throw new Error("Couldn't read this image");
	}

	return { blob, extension: "jpg", type: "image/jpeg" };
};

export const normalizeImageFile = async (file: File): Promise<File> => {
	// An iPhone HEIC becomes a JPEG here or is refused, never stored unviewable. from-image
	// bakes in the rotation while EXIF is still there, or a sideways-held photo is stored sideways.
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

		// Asked once: a five-photo gallery pick was otherwise testing the device ten times.
		const supportsWebp = await canEncodeWebp();

		// A WebP in budget goes up untouched; a JPEG or PNG only where the device can't encode
		// WebP, since converting here halves what the shop uplink carries.
		if (isInBudget && (file.type === "image/webp" || !supportsWebp)) {
			return file;
		}

		const scale = Math.min(1, MAX_UPLOAD_DIMENSION / longEdge);
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);

		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Couldn't read this image");
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
