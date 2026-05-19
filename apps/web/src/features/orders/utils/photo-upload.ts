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
	"image/heic",
];

export const isAcceptedImage = (value: string): value is PhotoContentType =>
	(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(value);

export interface UploadPhotoInput {
	file: File;
	contentType: PhotoContentType;
	note?: string;
}

export const uploadOrderServicePhoto = async (
	orderId: number,
	serviceId: number,
	{ file, contentType, note }: UploadPhotoInput,
) => {
	const presigned = await presignOrderServicePhoto(orderId, serviceId, {
		content_type: contentType,
	});
	await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
	await saveOrderServicePhoto(orderId, serviceId, {
		image_path: presigned.key,
		note,
	});
};

export const uploadOrderDropoffPhoto = async (
	orderId: number,
	{ file, contentType }: UploadPhotoInput,
) => {
	const presigned = await presignOrderDropoffPhoto(orderId, {
		content_type: contentType,
	});
	await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
	await saveOrderDropoffPhoto(orderId, { image_path: presigned.key });
};
