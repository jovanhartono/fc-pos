import { XIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { usePhotoCapture } from "@/features/orders/components/photo-capture-context";
import { PhotoCaptureControls } from "@/features/orders/components/photo-capture-controls";
import { PhotoCaptureStage } from "@/features/orders/components/photo-capture-stage";
import { ACCEPTED_IMAGE_TYPES } from "@/features/orders/utils/photo-upload";

/* Top chrome: close · position · item badge, over the viewfinder. Actions live in the
   bottom bar within thumb reach — nothing up here is a tap target but Close. */
const TopChrome = () => {
	const { actions, meta, state } = usePhotoCapture();

	return (
		<div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] pb-3">
			<button
				aria-label="Close"
				className="grid size-9 place-items-center justify-self-start rounded-full bg-white/10 text-white transition hover:bg-white/20"
				onClick={() => actions.onOpenChange(false)}
				type="button"
			>
				<XIcon className="size-5" aria-hidden="true" />
			</button>

			{!state.isShooting && state.photoCount > 1 ? (
				<p className="justify-self-center font-mono text-xs text-white/70 tabular-nums">
					{state.activeIndex + 1} / {state.photoCount}
				</p>
			) : (
				<span />
			)}

			<div className="justify-self-end">
				{meta.badgeLabel ? (
					<Badge
						className="border-white/40 bg-transparent text-white"
						variant="outline"
					>
						{meta.badgeLabel}
					</Badge>
				) : null}
			</div>
		</div>
	);
};

// Stays mounted whichever controls are showing — the shutter row's picker opens this same
// input, and moving it inside one arm turns that button dead mid-batch.
const HiddenFileInput = () => {
	const { actions, meta, state } = usePhotoCapture();

	return (
		<input
			ref={state.fileInputRef}
			type="file"
			aria-label={meta.labels.fileInput}
			accept={ACCEPTED_IMAGE_TYPES.join(",")}
			multiple={meta.isMultiple}
			className="sr-only"
			onChange={(event) => {
				const files = Array.from(event.target.files ?? []);
				// A gallery pick used to land behind a still-running viewfinder, so the
				// photo the cashier just chose was nowhere on screen. Cancelling the
				// picker (no files) must leave the camera alone.
				if (files.length > 0) {
					actions.stopCamera();
				}
				void actions.addFiles(files);
			}}
		/>
	);
};

export const PhotoCaptureDialog = () => {
	const { actions, meta, state } = usePhotoCapture();

	return (
		<Dialog
			open={meta.open}
			onOpenChange={actions.onOpenChange}
			onOpenChangeComplete={(isOpen) => {
				if (!isOpen) {
					actions.resetDialogState();
				}
			}}
		>
			<DialogContent
				className="inset-0 z-[60] flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-black p-0 text-white ring-0 sm:max-w-none"
				overlayClassName="z-[60] bg-black"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">{meta.title}</DialogTitle>
				<DialogDescription className="sr-only">
					{state.isShooting
						? "Capture a photo with the camera or upload one from your device."
						: "Pinch or double-tap to zoom. Swipe to move between photos."}
				</DialogDescription>

				<TopChrome />

				<PhotoCaptureStage />

				{/* Bottom chrome: native-camera controls while shooting, photo actions while
				    reviewing. Neither mode reserves height for the other's controls. */}
				<div className="shrink-0 space-y-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)_+_1rem)]">
					<PhotoCaptureControls />
					<HiddenFileInput />
				</div>
			</DialogContent>
		</Dialog>
	);
};
