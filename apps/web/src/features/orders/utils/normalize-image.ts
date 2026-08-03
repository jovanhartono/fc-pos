// Keep in step with MAX_IMAGE_DIMENSION in packages/server/src/utils/s3.ts.
// Anything larger spends shop-floor 4G on pixels the server discards when it
// re-encodes the photo.
export const MAX_UPLOAD_DIMENSION = 2560;

// A PNG screenshot of a garment can be 10MB inside the dimension budget, and the server
// re-encodes it to a few hundred KB regardless — those bytes are pure shop-floor 4G. Set
// above what a full-size camera capture weighs at q92, so a live shot still passes through
// instead of paying a second lossy generation to get under a byte limit.
const MAX_PASSTHROUGH_BYTES = 4_000_000;

const PASSTHROUGH_TYPES = ["image/jpeg", "image/png", "image/webp"];

const FILE_EXTENSION = /\.[^.]*$/;

export const normalizeImageFile = async (file: File): Promise<File> => {
	// iPhones hand over HEIC and only their own OS codec decodes it — that decode
	// happens here. Everywhere else this throws, which is the correct rejection:
	// the server cannot decode HEIC and other browsers show it as a broken image,
	// so the evidence would be gone by the time a customer disputes a tear.
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new Error("Unsupported image type");
	}

	try {
		const longEdge = Math.max(bitmap.width, bitmap.height);
		if (
			longEdge <= MAX_UPLOAD_DIMENSION &&
			file.size <= MAX_PASSTHROUGH_BYTES &&
			PASSTHROUGH_TYPES.includes(file.type)
		) {
			// Already in budget — re-encoding would burn a second lossy generation on
			// the photo that has to hold up in a dispute.
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
		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, "image/jpeg", 0.92);
		});
		if (!blob) {
			throw new Error("Unable to process this image");
		}

		return new File([blob], `${file.name.replace(FILE_EXTENSION, "")}.jpg`, {
			type: "image/jpeg",
		});
	} finally {
		bitmap.close();
	}
};
