import {
	presignItemPhoto,
	presignOrderDropoffPhoto,
	saveItemPhoto,
	saveOrderDropoffPhoto,
} from "@/features/orders/api";
import { type PhotoContentType, uploadFileToPresignedUrl } from "@/lib/http";

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
	// A photo staff retake stops competing with its replacement for the uplink
	// and leaves nothing in the bucket.
	signal?: AbortSignal;
}

/**
 * `pushBytes` is the slow trip over shop 4G; `commit` saves it against the Order. Split so the
 * next photo uploads while this one saves, without two saves shuffling a before/after pair.
 */
export interface PhotoUploader {
	commit: (key: string, input: UploadPhotoInput) => Promise<void>;
	pushBytes: (input: UploadPhotoInput) => Promise<string>;
}

/**
 * An early upload that died on 4G is sent again rather than failing the batch; one that
 * succeeded is never sent twice, or the bucket holds a second copy.
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

export const itemPhotoUploader = (
	orderId: number,
	itemId: number,
): PhotoUploader => ({
	pushBytes: async ({ file, contentType, signal }) => {
		const presigned = await presignItemPhoto(orderId, itemId, {
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
		await saveItemPhoto(orderId, itemId, {
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

// The Drop-off photo is a single column on the Order, so it is always one photo and the
// POS uploads it straight after checkout rather than through the dialog.
export const uploadOrderDropoffPhoto = async (
	orderId: number,
	input: UploadPhotoInput,
) => {
	const uploader = orderDropoffPhotoUploader(orderId);
	const key = await uploader.pushBytes(input);
	await uploader.commit(key, input);
};
