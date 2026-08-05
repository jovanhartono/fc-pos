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
}

/**
 * Uploading a photo is two jobs with very different costs, so a batch needs them apart.
 * `pushBytes` is the slow one — a presign plus the file itself over shop 4G. `commit` is a
 * small request the server answers only after it has re-encoded the image, and it decides
 * the row id the gallery sorts on. Keeping them separate lets a caller push the next
 * photo's bytes while the server is still working on the current one, without letting two
 * commits race and shuffle a before/after pair.
 */
export interface PhotoUploader {
	commit: (key: string, input: UploadPhotoInput) => Promise<void>;
	pushBytes: (input: UploadPhotoInput) => Promise<string>;
}

export const orderServicePhotoUploader = (
	orderId: number,
	serviceId: number,
): PhotoUploader => ({
	pushBytes: async ({ file, contentType }) => {
		const presigned = await presignOrderServicePhoto(orderId, serviceId, {
			content_type: contentType,
		});
		await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
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
	pushBytes: async ({ file, contentType }) => {
		const presigned = await presignOrderDropoffPhoto(orderId, {
			content_type: contentType,
		});
		await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
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
