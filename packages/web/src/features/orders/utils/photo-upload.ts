import type { PhotoContentType } from "@/lib/api";

export const ACCEPTED_IMAGE_TYPES: readonly PhotoContentType[] = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
];

export const isAcceptedImage = (value: string): value is PhotoContentType =>
	(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(value);
