import {
	CameraIcon,
	CircleNotchIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { usePhotoCapture } from "@/features/orders/components/photo-capture-context";
import { PhotoStage } from "@/features/orders/components/photo-stage";

const StageSurface = () => {
	const { actions, state } = usePhotoCapture();

	if (state.isShooting) {
		return (
			<video
				ref={state.camera.previewRef}
				autoPlay
				muted
				playsInline
				onLoadedMetadata={state.camera.markReady}
				className="size-full object-contain"
			/>
		);
	}

	if (state.selectedPhoto) {
		return (
			<PhotoStage
				activeIndex={state.activeIndex}
				items={state.stageItems}
				onIndexChange={actions.selectPhotoAt}
			/>
		);
	}

	// No sentence: the two buttons below already say what they do, and saying it
	// twice put a second focal point in the middle of an otherwise empty screen.
	return (
		<div className="grid size-full place-items-center">
			<CameraIcon className="size-10 text-white/40" aria-hidden="true" />
		</div>
	);
};

/** Live feed, reviewed still, or empty hint. */
export const PhotoCaptureStage = () => {
	const { meta, state } = usePhotoCapture();

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<StageSurface />

			{/* Picking from the gallery before any photo exists leaves nothing on screen to hang
			    a spinner off — the only feedback was the picker icon dimming, which read as a
			    dead button and got retapped. The stage carries it instead, so every mode shows
			    it, and the confirm button is free to stay narrow enough to sit beside the
			    shutter without "Uploading 4 of 5..." growing into it. */}
			{state.isBusy ? (
				<div
					aria-live="polite"
					className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 text-sm text-white"
					role="status"
				>
					<CircleNotchIcon className="size-7 animate-spin" />
					<p>{meta.labels.busy}</p>
				</div>
			) : null}

			{state.camera.error ? (
				<div className="absolute inset-x-4 bottom-4 flex items-start gap-2 border border-destructive/40 bg-destructive px-3 py-2 text-sm text-destructive-foreground">
					<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
					<span>{state.camera.error}</span>
				</div>
			) : null}
		</div>
	);
};
