import {
	CameraIcon,
	ImageSquareIcon,
	WarningCircleIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCameraCapture } from "@/features/orders/hooks/useCameraCapture";
import {
	ACCEPTED_IMAGE_TYPES,
	isAcceptedImage,
	type UploadPhotoInput,
} from "@/features/orders/utils/photo-upload";
import { cn } from "@/lib/utils";

interface PendingPhoto {
	id: string;
	file: File;
	previewUrl: string;
}

const createPendingPhoto = (file: File): PendingPhoto => ({
	file,
	id: crypto.randomUUID(),
	previewUrl: URL.createObjectURL(file),
});

const revokePhotos = (photos: PendingPhoto[]) => {
	for (const photo of photos) {
		URL.revokeObjectURL(photo.previewUrl);
	}
};

interface PhotoThumbProps {
	disabled: boolean;
	isActive: boolean;
	onRemove: () => void;
	onSelect: () => void;
	photo: PendingPhoto;
}

// One captured/picked still in the bottom thumb strip (iOS-camera style): tap to
// review it in the stage, the corner × removes it.
const PhotoThumb = ({
	disabled,
	isActive,
	onRemove,
	onSelect,
	photo,
}: PhotoThumbProps) => (
	<div className="relative shrink-0">
		<button
			aria-current={isActive}
			aria-label={`Preview ${photo.file.name}`}
			className={cn(
				"block size-14 overflow-hidden border bg-white/5 transition",
				isActive
					? "border-white ring-1 ring-white"
					: "border-white/30 opacity-70 hover:opacity-100",
			)}
			onClick={onSelect}
			type="button"
		>
			<img alt="" className="size-full object-cover" src={photo.previewUrl} />
		</button>
		<button
			aria-label={`Remove ${photo.file.name}`}
			className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/60 text-white shadow-sm transition hover:bg-black/80 disabled:opacity-50"
			disabled={disabled}
			onClick={onRemove}
			type="button"
		>
			<XIcon className="size-3" aria-hidden="true" />
		</button>
	</div>
);

interface PhotoUploadDialogBaseProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	badgeLabel?: string;
	multiple: boolean;
	withNote: boolean;
	// Upload mode: presign → upload → save on confirm.
	uploadPhoto?: (input: UploadPhotoInput) => Promise<void>;
	onUploaded?: () => Promise<void>;
	// Capture-only mode: hand the picked File(s) back instead of uploading. Used
	// at the POS where the Order does not exist yet, so the upload is deferred to
	// after checkout commits. When set, uploadPhoto/onUploaded are ignored.
	onCapture?: (files: File[]) => void;
	// Camera-only: drop the "Upload from device" path, auto-open the camera, and
	// stop it after a shot for a single review still. For intake flows that want
	// a live photo, not a gallery pick. See SinglePhotoCaptureDialog.
	cameraOnly?: boolean;
}

const PhotoUploadDialogBase = ({
	open,
	onOpenChange,
	title,
	badgeLabel,
	multiple,
	withNote,
	uploadPhoto,
	onUploaded,
	onCapture,
	cameraOnly = false,
}: PhotoUploadDialogBaseProps) => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const camera = useCameraCapture();
	const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
	const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
	const [note, setNote] = useState("");

	const stopCamera = camera.stop;
	const openCamera = camera.open;
	const resetDialogState = useCallback(() => {
		stopCamera();
		setPendingPhotos((previous) => {
			revokePhotos(previous);
			return [];
		});
		setSelectedPhotoId(null);
		setNote("");
	}, [stopCamera]);

	useEffect(() => {
		if (!open) {
			return;
		}
		// Camera-only intake: skip the chooser, go straight to the live camera.
		if (cameraOnly) {
			void openCamera();
		}
	}, [open, cameraOnly, openCamera]);

	// Release the camera if the dialog unmounts while still open. The visual reset
	// (stop camera + clear photos) is deferred to onOpenChangeComplete so the popup
	// keeps its full height through the close animation instead of collapsing and
	// re-centering first — that snap was the layout shift.
	useEffect(() => stopCamera, [stopCamera]);

	const addFiles = useCallback(
		(files: File[]) => {
			if (files.length === 0) {
				return;
			}

			const accepted = multiple ? files : files.slice(0, 1);

			const unsupportedFile = accepted.find(
				(file) => !isAcceptedImage(file.type),
			);
			if (unsupportedFile) {
				toast.error(`Unsupported image type: ${unsupportedFile.name}`);
				return;
			}

			const created = accepted.map((file) => createPendingPhoto(file));
			setPendingPhotos((previous) => {
				if (!multiple) {
					revokePhotos(previous);
					return created;
				}
				return [...previous, ...created];
			});
			const newest = created.at(-1);
			if (newest) {
				setSelectedPhotoId(newest.id);
			}
		},
		[multiple],
	);

	const openFileInput = () => {
		const input = fileInputRef.current;
		if (!input) {
			return;
		}

		input.value = "";
		if (typeof input.showPicker === "function") {
			input.showPicker();
			return;
		}

		input.click();
	};

	const captureCameraPhoto = async () => {
		const blob = await camera.capture();
		if (!blob) {
			return;
		}

		const timestamp = Date.now();
		addFiles([
			new File([blob], `photo-${timestamp}.jpg`, {
				type: "image/jpeg",
			}),
		]);
		// Single-photo flows: stop after the shot so the still preview replaces the
		// live feed in the stage. Multiple-photo flows keep the camera open so
		// consecutive shots can be taken — the shots pile up in the thumb strip.
		if (!multiple) {
			stopCamera();
		}
	};

	const removePhoto = (photoId: string) => {
		setPendingPhotos((previous) =>
			previous.filter((photo) => {
				if (photo.id === photoId) {
					URL.revokeObjectURL(photo.previewUrl);
					return false;
				}
				return true;
			}),
		);
	};

	// Tapping a thumb reviews it in the stage, so the live feed must yield to the
	// still — stop the camera and let the user reopen it to shoot more.
	const reviewPhoto = (photoId: string) => {
		setSelectedPhotoId(photoId);
		stopCamera();
	};

	const uploadMutation = useMutation({
		mutationFn: async () => {
			if (pendingPhotos.length === 0) {
				throw new Error("Add at least one photo");
			}

			const validatedPhotos = pendingPhotos.map((photo) => {
				const contentType = photo.file.type;
				if (!isAcceptedImage(contentType)) {
					throw new Error(`Unsupported image type: ${photo.file.name}`);
				}
				return { ...photo, contentType };
			});

			const trimmedNote = withNote ? note.trim() || undefined : undefined;
			// TODO: make this parallel instead of waterfall request
			for (const photo of validatedPhotos) {
				await uploadPhoto?.({
					file: photo.file,
					contentType: photo.contentType,
					note: trimmedNote,
				});
			}
		},
		onSuccess: async () => {
			toast.success(
				pendingPhotos.length > 1 ? "Photos uploaded" : "Photo uploaded",
			);
			onOpenChange(false);
			await onUploaded?.();
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to upload photos");
		},
	});

	const isBusy = uploadMutation.isPending;
	const photoNoun = multiple ? "photos" : "photo";
	const labelSuffix = badgeLabel ? ` for ${badgeLabel}` : "";

	const isCaptureMode = Boolean(onCapture);
	const confirmBase = isCaptureMode
		? multiple
			? "Use photos"
			: "Use photo"
		: "Upload";
	const confirmLabel =
		multiple && pendingPhotos.length > 0
			? `${confirmBase} · ${pendingPhotos.length}`
			: confirmBase;
	const handleConfirm = async () => {
		if (onCapture) {
			onCapture(pendingPhotos.map((photo) => photo.file));
			onOpenChange(false);
			return;
		}
		await uploadMutation.mutateAsync();
	};

	// The stage shows the live feed while shooting; otherwise the reviewed still
	// (falling back to the latest shot if the selection was removed).
	const selectedPhoto =
		pendingPhotos.find((photo) => photo.id === selectedPhotoId) ??
		pendingPhotos.at(-1) ??
		null;
	const cameraButtonLabel =
		pendingPhotos.length === 0 ? "Open camera" : multiple ? "Camera" : "Retake";
	const placeholderText = cameraOnly
		? "Camera is required for this photo."
		: "Open the camera or pick from your device.";

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={(isOpen) => {
				if (!isOpen) {
					resetDialogState();
				}
			}}
		>
			<DialogContent
				className="inset-0 z-[60] flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-black p-0 text-white ring-0 sm:max-w-none"
				overlayClassName="z-[60] bg-black"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<DialogDescription className="sr-only">
					Capture a photo with the camera or upload one from your device.
				</DialogDescription>

				{/* Top chrome: close · item badge, over the viewfinder. */}
				<div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] pb-3">
					<button
						aria-label="Close"
						className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
						onClick={() => onOpenChange(false)}
						type="button"
					>
						<XIcon className="size-5" aria-hidden="true" />
					</button>
					{badgeLabel ? (
						<Badge
							className="border-white/40 bg-transparent text-white"
							variant="outline"
						>
							{badgeLabel}
						</Badge>
					) : null}
				</div>

				{/* Viewfinder: live feed, reviewed still, or empty hint. */}
				<div className="relative min-h-0 flex-1 overflow-hidden px-4">
					{camera.isOpen ? (
						<video
							ref={camera.previewRef}
							autoPlay
							muted
							playsInline
							onLoadedMetadata={camera.markReady}
							className="size-full object-cover"
						/>
					) : selectedPhoto ? (
						<img
							src={selectedPhoto.previewUrl}
							alt={`Preview ${selectedPhoto.file.name}`}
							className="size-full object-contain"
						/>
					) : (
						<div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/70">
							<CameraIcon className="size-10 opacity-60" />
							<p>{placeholderText}</p>
						</div>
					)}

					{camera.error ? (
						<div className="absolute inset-x-4 bottom-4 flex items-start gap-2 border border-destructive/40 bg-destructive px-3 py-2 text-sm text-destructive-foreground">
							<WarningCircleIcon
								className="mt-0.5 size-4 shrink-0"
								weight="fill"
							/>
							<span>{camera.error}</span>
						</div>
					) : null}
				</div>

				{/* Bottom chrome: thumbs · shutter · device, note, primary action. */}
				<div className="shrink-0 space-y-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)_+_1rem)]">
					<div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2">
						<div className="flex min-w-0 items-center gap-2 overflow-x-auto py-1">
							{pendingPhotos.map((photo) => (
								<PhotoThumb
									disabled={isBusy}
									isActive={!camera.isOpen && selectedPhoto?.id === photo.id}
									key={photo.id}
									onRemove={() => removePhoto(photo.id)}
									onSelect={() => reviewPhoto(photo.id)}
									photo={photo}
								/>
							))}
						</div>

						<div className="justify-self-center">
							{camera.isOpen ? (
								<button
									aria-label="Capture photo"
									className="grid size-16 place-items-center rounded-full border-4 border-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
									disabled={!camera.isReady || isBusy}
									onClick={captureCameraPhoto}
									type="button"
								>
									<span className="size-12 rounded-full bg-white transition active:scale-90" />
								</button>
							) : (
								<button
									className="flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 font-medium text-sm text-white transition hover:bg-white/20 disabled:opacity-40"
									disabled={isBusy}
									onClick={() => void openCamera()}
									type="button"
								>
									<CameraIcon className="size-4" aria-hidden="true" />
									{cameraButtonLabel}
								</button>
							)}
						</div>

						<div className="justify-self-end">
							{cameraOnly ? null : (
								<button
									aria-label="Upload from device"
									className="grid size-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
									disabled={isBusy}
									onClick={openFileInput}
									type="button"
								>
									<ImageSquareIcon className="size-5" aria-hidden="true" />
								</button>
							)}
						</div>
					</div>

					{cameraOnly ? null : (
						<input
							ref={fileInputRef}
							type="file"
							aria-label={`Choose ${photoNoun}${labelSuffix}`}
							accept={ACCEPTED_IMAGE_TYPES.join(",")}
							multiple={multiple}
							className="sr-only"
							onChange={(event) => {
								addFiles(Array.from(event.target.files ?? []));
							}}
						/>
					)}

					{withNote ? (
						<Textarea
							value={note}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Optional note"
							rows={2}
							maxLength={200}
							disabled={isBusy || pendingPhotos.length === 0}
							aria-label={`Photo note${labelSuffix}`}
							className="border-white/20 bg-white/5 text-white placeholder:text-white/50 disabled:opacity-50"
						/>
					) : null}

					<Button
						className="h-14 w-full bg-white font-semibold text-base text-black hover:bg-white/90"
						type="button"
						disabled={pendingPhotos.length === 0 || isBusy}
						loading={isBusy}
						loadingText="Uploading..."
						onClick={handleConfirm}
					>
						{confirmLabel}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
};

type PhotoUploadDialogProps = Omit<
	PhotoUploadDialogBaseProps,
	"multiple" | "withNote" | "onCapture"
>;

export const PhotoUploadDialog = (props: PhotoUploadDialogProps) => (
	<PhotoUploadDialogBase {...props} multiple withNote />
);

export const SinglePhotoUploadDialog = (props: PhotoUploadDialogProps) => (
	<PhotoUploadDialogBase {...props} multiple={false} withNote={false} />
);

type SinglePhotoCaptureDialogProps = Pick<
	PhotoUploadDialogBaseProps,
	"open" | "onOpenChange" | "title" | "badgeLabel" | "cameraOnly"
> & {
	onCapture: (file: File) => void;
};

// Capture-only single-photo dialog. Reuses the full-screen camera/picker/preview
// UI but, instead of uploading, hands the picked File back to the caller — for
// flows where the target row does not exist yet (POS drop-off photo before
// checkout) or where the upload is bundled with other data (pickup event).
//
// Defaults to camera-only: drop-off is an intake action, so we want a live photo
// of the items in front of the cashier, not a gallery pick. Trade-off: a device
// with no camera (or denied permission) cannot complete it — accepted, since the
// POS runs on store iPads. Pass cameraOnly={false} for flows that should still
// allow a gallery pick (e.g. pickup).
export const SinglePhotoCaptureDialog = ({
	onCapture,
	cameraOnly = true,
	...props
}: SinglePhotoCaptureDialogProps) => (
	<PhotoUploadDialogBase
		{...props}
		multiple={false}
		withNote={false}
		cameraOnly={cameraOnly}
		onCapture={(files) => {
			const [file] = files;
			if (file) {
				onCapture(file);
			}
		}}
	/>
);
