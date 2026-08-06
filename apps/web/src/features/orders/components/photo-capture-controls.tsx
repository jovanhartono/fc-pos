import {
	CameraIcon,
	CheckIcon,
	CircleNotchIcon,
	ImageSquareIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { usePhotoCapture } from "@/features/orders/components/photo-capture-context";
import {
	PhotoCaptureNoteField,
	PhotoCaptureNoteToggle,
} from "@/features/orders/components/photo-capture-note";

const GalleryPickerButton = () => {
	const { actions, state } = usePhotoCapture();

	return (
		<button
			aria-label="Upload from device"
			className="grid size-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
			disabled={state.isBusy}
			onClick={actions.openFileInput}
			type="button"
		>
			<ImageSquareIcon className="size-5" aria-hidden="true" />
		</button>
	);
};

const ReviewSquare = () => {
	const { actions, meta, state } = usePhotoCapture();
	const { lastPhoto } = state;

	if (!lastPhoto) {
		return null;
	}

	return (
		<button
			aria-label={meta.labels.review}
			className="relative block size-14 overflow-hidden border border-white/40 bg-white/5 disabled:opacity-40"
			disabled={state.isBusy}
			onClick={() => actions.reviewPhoto(lastPhoto.id)}
			type="button"
		>
			<img
				alt=""
				className="size-full object-cover"
				src={lastPhoto.previewUrl}
			/>
			{state.photoCount > 1 ? (
				<span className="absolute top-0 right-0 grid size-5 place-items-center bg-white text-[0.625rem] font-medium text-black tabular-nums">
					{state.photoCount}
				</span>
			) : null}
		</button>
	);
};

/* Finish the batch from where a document scanner puts it: bottom-right, beside the shot
   count, both a thumb's width from the shutter. Squared off rather than round, so a white
   circle beside the shutter is never mistaken for a second one. The picker gives up the
   slot once a shot exists — mid-batch gallery picks are rare, and it is still one tap
   behind the review square. */
const ShutterTrailingSlot = () => {
	const { actions, meta, state } = usePhotoCapture();

	if (state.photoCount === 0) {
		return <GalleryPickerButton />;
	}

	return (
		<button
			aria-label={meta.labels.confirmAria}
			className="grid size-14 place-items-center bg-white text-black transition hover:bg-white/90 disabled:opacity-40"
			disabled={state.isBusy}
			onClick={actions.confirm}
			type="button"
		>
			{state.isBusy ? (
				<CircleNotchIcon className="size-6 animate-spin" />
			) : (
				<CheckIcon className="size-7" aria-hidden="true" />
			)}
		</button>
	);
};

const ShutterControls = () => {
	const { actions, state } = usePhotoCapture();

	return (
		<div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2">
			<div className="justify-self-start">
				<ReviewSquare />
			</div>

			<button
				aria-label="Capture photo"
				className="grid size-16 place-items-center justify-self-center rounded-full border-4 border-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
				disabled={!state.camera.isReady || state.isBusy}
				onClick={actions.captureCameraPhoto}
				type="button"
			>
				<span className="size-12 rounded-full bg-white transition active:scale-90" />
			</button>

			<div className="justify-self-end">
				<ShutterTrailingSlot />
			</div>
		</div>
	);
};

// Nothing captured yet, so there is only one thing to do: the camera takes the width and
// the fill that the confirm button takes once there is something to confirm, and the
// picker sits beside it as the exception it is.
const EmptyControls = () => {
	const { actions, state } = usePhotoCapture();

	return (
		<div className="flex h-14 items-center gap-2">
			<button
				className="flex h-14 flex-1 items-center justify-center gap-2 bg-white font-semibold text-base text-black transition hover:bg-white/90 disabled:opacity-40"
				disabled={state.isBusy}
				onClick={() => void actions.openCamera()}
				type="button"
			>
				<CameraIcon className="size-5" aria-hidden="true" />
				Open camera
			</button>

			<button
				aria-label="Upload from device"
				className="grid size-14 place-items-center border border-white/30 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
				disabled={state.isBusy}
				onClick={actions.openFileInput}
				type="button"
			>
				<ImageSquareIcon className="size-6" aria-hidden="true" />
			</button>
		</div>
	);
};

const RemovePhotoButton = () => {
	const { actions, state } = usePhotoCapture();
	const { selectedPhoto } = state;

	if (!selectedPhoto) {
		return null;
	}

	return (
		<button
			aria-label={`Remove ${selectedPhoto.file.name}`}
			className="ml-auto grid size-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
			disabled={state.isBusy}
			onClick={() => actions.removePhoto(selectedPhoto.id)}
			type="button"
		>
			<TrashIcon className="size-5" aria-hidden="true" />
		</button>
	);
};

const ReviewControls = () => {
	const { actions, meta, state } = usePhotoCapture();

	return (
		<>
			<div className="flex h-12 items-center gap-2">
				<button
					className="flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 font-medium text-sm text-white transition hover:bg-white/20 disabled:opacity-40"
					disabled={state.isBusy}
					onClick={() => void actions.openCamera()}
					type="button"
				>
					<CameraIcon className="size-4" aria-hidden="true" />
					{meta.labels.cameraButton}
				</button>

				<GalleryPickerButton />

				<PhotoCaptureNoteToggle />

				<RemovePhotoButton />
			</div>

			<PhotoCaptureNoteField />

			<Button
				className="h-14 w-full bg-white font-semibold text-base text-black hover:bg-white/90"
				type="button"
				disabled={state.isBusy}
				loading={state.isBusy}
				onClick={actions.confirm}
			>
				{meta.labels.confirm}
			</Button>
		</>
	);
};

export const PhotoCaptureControls = () => {
	const { state } = usePhotoCapture();

	if (state.isShooting) {
		return <ShutterControls />;
	}

	if (state.photoCount === 0) {
		return <EmptyControls />;
	}

	return <ReviewControls />;
};
