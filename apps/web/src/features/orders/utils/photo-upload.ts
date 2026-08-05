import {
	type PhotoContentType,
	presignOrderDropoffPhoto,
	presignOrderServicePhoto,
	saveOrderDropoffPhoto,
	saveOrderServicePhoto,
	uploadFileToPresignedUrl,
} from "@/lib/api";

export const ACCEPTED_IMAGE_TYPES: readonly PhotoContentType[] = [
	"image/jpeg",
	"image/png",
	"image/webp",
];

export const isAcceptedImage = (value: string): value is PhotoContentType =>
	(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(value);

export interface UploadPhotoInput {
	file: File;
	contentType: PhotoContentType;
	note?: string;
	// Cancels the bytes mid-flight, for a push that started when the photo was staged. A shot the
	// operator retakes stops competing with its replacement for the uplink, and leaves nothing
	// behind in the bucket — a cancelled upload is never stored.
	signal?: AbortSignal;
}

/**
 * Uploading a photo is two jobs with very different costs, so a batch keeps them apart.
 * `pushBytes` is the slow one: the file itself over shop 4G. `commit` is the small request that
 * files it against the order and decides the row id the gallery sorts on. Split, a caller can
 * send the next photo's bytes while the current one is being filed, without letting two commits
 * race and shuffle a before/after pair.
 */
export interface PhotoUploader {
	commit: (key: string, input: UploadPhotoInput) => Promise<void>;
	pushBytes: (input: UploadPhotoInput) => Promise<string>;
}

/**
 * The key to commit, for a photo whose upload may already have started when it was staged. One
 * that died in between — dropped 4G, the phone carried out of range — is sent again rather than
 * failing the whole batch. One that succeeded is never sent twice: that would leave a second copy
 * of the same evidence in the bucket.
 */
export const resolveUploadedKey = async (
	uploader: PhotoUploader,
	input: UploadPhotoInput,
	staged?: Promise<string>,
): Promise<string> => {
	if (staged) {
		const key = await staged.catch(() => null);
		if (key !== null) {
			return key;
		}
	}

	return uploader.pushBytes(input);
};

export const orderServicePhotoUploader = (
	orderId: number,
	serviceId: number,
): PhotoUploader => ({
	pushBytes: async ({ file, contentType, signal }) => {
		const presigned = await presignOrderServicePhoto(orderId, serviceId, {
			content_type: contentType,
		});
		await uploadFileToPresignedUrl(
			presigned.upload_url,
			file,
			contentType,
			signal,
		);
		return presigned.key;
	},
	commit: async (key, { note }) => {
		await saveOrderServicePhoto(orderId, serviceId, {
			image_path: key,
			note,
		});
	},
});

export const orderDropoffPhotoUploader = (orderId: number): PhotoUploader => ({
	pushBytes: async ({ file, contentType, signal }) => {
		const presigned = await presignOrderDropoffPhoto(orderId, {
			content_type: contentType,
		});
		await uploadFileToPresignedUrl(
			presigned.upload_url,
			file,
			contentType,
			signal,
		);
		return presigned.key;
	},
	commit: async (key) => {
		await saveOrderDropoffPhoto(orderId, { image_path: key });
	},
});

// The drop-off photo is a single column on the order, so it is always one photo and the
// POS uploads it straight after checkout rather than through the dialog.
export const uploadOrderDropoffPhoto = async (
	orderId: number,
	input: UploadPhotoInput,
) => {
	const uploader = orderDropoffPhotoUploader(orderId);
	const key = await uploader.pushBytes(input);
	await uploader.commit(key, input);
};
