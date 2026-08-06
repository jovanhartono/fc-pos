import { describe, expect, it } from "bun:test";
import {
	type PhotoCaptureLabelsInput,
	type PhotoCaptureVariant,
	resolvePhotoCaptureLabels,
} from "@/features/orders/components/photo-capture-labels";

const labelsFor = (
	variant: PhotoCaptureVariant,
	overrides: Partial<Omit<PhotoCaptureLabelsInput, "variant">> = {},
) =>
	resolvePhotoCaptureLabels({
		normalizing: null,
		photoCount: 0,
		uploading: null,
		variant,
		...overrides,
	});

describe("resolvePhotoCaptureLabels", () => {
	it("counts the batch on the confirm button so the counter sees how many item photos are about to be filed", () => {
		expect(labelsFor("batch-upload", { photoCount: 3 }).confirm).toBe(
			"Upload · 3",
		);
		expect(labelsFor("batch-upload").confirm).toBe("Upload");
	});

	it("keeps the single-photo dialogs countless", () => {
		expect(labelsFor("single-upload", { photoCount: 1 }).confirm).toBe(
			"Upload",
		);
		expect(labelsFor("single-capture", { photoCount: 1 }).confirm).toBe(
			"Use photo",
		);
	});

	it("offers a retake where only one photo can be kept, and another shot where a batch can grow", () => {
		expect(labelsFor("batch-upload").cameraButton).toBe("Camera");
		expect(labelsFor("single-upload").cameraButton).toBe("Retake");
		expect(labelsFor("single-capture").cameraButton).toBe("Retake");
	});

	it("names the item the photos belong to, so a counter mid-order knows which one the picker is for", () => {
		expect(
			labelsFor("batch-upload", { badgeLabel: "SHIRT-01" }).fileInput,
		).toBe("Choose photos for SHIRT-01");
		expect(labelsFor("single-upload").fileInput).toBe("Choose photo");
		expect(labelsFor("single-capture", { badgeLabel: "Drop-off" }).note).toBe(
			"Photo note for Drop-off",
		);
	});

	it("counts the batch aloud for assistive tech, which the shutter row has no room to print", () => {
		expect(labelsFor("batch-upload", { photoCount: 4 }).confirmAria).toBe(
			"Upload, 4 photos",
		);
		expect(labelsFor("batch-upload", { photoCount: 1 }).confirmAria).toBe(
			"Upload",
		);
	});

	it("reports which photo of a pick is being scaled down, and prefers that over the upload count", () => {
		expect(
			labelsFor("batch-upload", { normalizing: { done: 1, total: 5 } }).busy,
		).toBe("Processing 2 of 5...");
		expect(
			labelsFor("batch-upload", {
				normalizing: { done: 0, total: 1 },
				uploading: { done: 0, total: 3 },
			}).busy,
		).toBe("Processing...");
		expect(
			labelsFor("batch-upload", { uploading: { done: 2, total: 3 } }).busy,
		).toBe("Uploading 3 of 3...");
		expect(labelsFor("batch-upload").busy).toBe("Uploading...");
	});
});
