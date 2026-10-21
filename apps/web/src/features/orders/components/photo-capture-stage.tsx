import {
	AlertCircleIcon,
	Camera01Icon,
	Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
			<HugeiconsIcon
				icon={Camera01Icon}
				className="size-10 text-white/40"
				aria-hidden="true"
			/>
		</div>
	);
};

export const PhotoCaptureStage = () => {
	const { meta, state } = usePhotoCapture();

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<StageSurface />

			{/* A first gallery pick only dimmed the picker icon, which read as dead and
			    got retapped; progress shows on the stage instead. */}
			{state.isBusy ? (
				<div
					aria-live="polite"
					className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 text-body text-white"
					role="status"
				>
					<HugeiconsIcon icon={Loading03Icon} className="size-7 animate-spin" />
					<p>{meta.labels.busy}</p>
				</div>
			) : null}

			{state.camera.error ? (
				<div className="absolute inset-x-4 bottom-4 flex items-start gap-2 border border-destructive/40 bg-destructive px-3 py-2 text-body text-destructive-foreground">
					<HugeiconsIcon
						icon={AlertCircleIcon}
						className="mt-0.5 size-4 shrink-0"
					/>
					<span>{state.camera.error}</span>
				</div>
			) : null}
		</div>
	);
};
