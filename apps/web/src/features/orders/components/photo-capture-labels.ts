export type PhotoCaptureVariant =
	| "batch-upload"
	| "single-capture"
	| "single-upload";

interface PhotoCaptureProgress {
	done: number;
	total: number;
}

export interface PhotoCaptureLabelsInput {
	badgeLabel?: string;
	normalizing: PhotoCaptureProgress | null;
	photoCount: number;
	uploading: PhotoCaptureProgress | null;
	variant: PhotoCaptureVariant;
}

export interface PhotoCaptureLabels {
	busy: string;
	cameraButton: string;
	confirm: string;
	confirmAria: string;
	fileInput: string;
	note: string;
	notePlaceholder: string;
	review: string;
}

const progressLabel = (verb: string, progress: PhotoCaptureProgress | null) =>
	progress && progress.total > 1
		? `${verb} ${progress.done + 1} of ${progress.total}...`
		: `${verb}...`;

export const resolvePhotoCaptureLabels = ({
	badgeLabel,
	normalizing,
	photoCount,
	uploading,
	variant,
}: PhotoCaptureLabelsInput): PhotoCaptureLabels => {
	const isMultiple = variant === "batch-upload";
	const suffix = badgeLabel ? ` for ${badgeLabel}` : "";
	const confirmBase = variant === "single-capture" ? "Use photo" : "Upload";

	return {
		busy: normalizing
			? progressLabel("Processing", normalizing)
			: progressLabel("Uploading", uploading),
		// Only ever rendered with a shot already in hand — the empty state has its own button.
		cameraButton: isMultiple ? "Camera" : "Retake",
		confirm:
			isMultiple && photoCount > 0
				? `${confirmBase} · ${photoCount}`
				: confirmBase,
		// The shutter row has no width to spare for a word, so the count stays on the review
		// square and the tick carries the action. Assistive tech still gets the full sentence.
		confirmAria:
			photoCount > 1 ? `${confirmBase}, ${photoCount} photos` : confirmBase,
		fileInput: `Choose ${isMultiple ? "photos" : "photo"}${suffix}`,
		note: `Photo note${suffix}`,
		notePlaceholder:
			photoCount > 1 ? `Note for all ${photoCount} photos` : "Optional note",
		review: `Review ${photoCount} ${photoCount === 1 ? "photo" : "photos"}`,
	};
};
