import {
	CameraIcon,
	ImageSquareIcon,
	PencilSimpleLineIcon,
	TrashIcon,
	WarningCircleIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PhotoStage } from "@/features/orders/components/photo-stage";
import { useCameraCapture } from "@/features/orders/hooks/useCameraCapture";
import { normalizeImageFile } from "@/features/orders/utils/normalize-image";
import {
	ACCEPTED_IMAGE_TYPES,
	isAcceptedImage,
	type UploadPhotoInput,
} from "@/features/orders/utils/photo-upload";
import { readServerErrorMessage } from "@/lib/server-error";
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
	const [isNoteOpen, setIsNoteOpen] = useState(false);
	const [isNormalizing, setIsNormalizing] = useState(false);
	const sessionRef = useRef(0);

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
		setIsNoteOpen(false);
	}, [stopCamera]);

	useEffect(() => {
		// A scale-down that finishes after the operator gave up on the dialog must not push
		// its photo into the next order's evidence: opening or closing voids work in flight.
		sessionRef.current += 1;
		setIsNormalizing(false);

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

	// Single entry point for the strip: a 12MP phone photo is scaled down before it
	// ever reaches 4G, and an iPhone HEIC either becomes a JPEG here or is rejected
	// here rather than sitting in S3 as unviewable dispute evidence.
	const addFiles = useCallback(
		async (files: File[]) => {
			if (files.length === 0) {
				return;
			}

			const accepted = multiple ? files : files.slice(0, 1);
			const session = sessionRef.current;
			setIsNormalizing(true);

			const normalized: File[] = [];
			try {
				for (const file of accepted) {
					try {
						normalized.push(await normalizeImageFile(file));
					} catch (error) {
						toast.error(
							`${error instanceof Error && error.message ? error.message : "Unsupported image type"}: ${file.name}`,
						);
					}
					if (sessionRef.current !== session) {
						return;
					}
				}
			} finally {
				if (sessionRef.current === session) {
					setIsNormalizing(false);
				}
			}

			if (normalized.length === 0) {
				return;
			}

			const created = normalized.map((file) => createPendingPhoto(file));
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
		await addFiles([
			new File([blob], `photo-${timestamp}.jpg`, {
				type: "image/jpeg",
			}),
		]);
		// Single-photo flows: stop after the shot so the still preview replaces the
		// live feed in the stage. Multiple-photo flows keep the camera open so
		// consecutive shots can be taken — the shots pile up behind the last-shot
		// square, which the operator taps once to review them all.
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

	// Reviewing a still means the live feed must yield to it — stop the camera and let
	// the operator reopen it to shoot more.
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
			toast.error(readServerErrorMessage(error, "Failed to upload photos"));
		},
	});

	// Normalizing counts as busy: confirming while a pick is still being scaled down uploaded
	// only the photos that had landed, toasted success, and dropped the rest of the evidence.
	const isBusy = uploadMutation.isPending || isNormalizing;
	const photoCount = pendingPhotos.length;
	const photoNoun = multiple ? "photos" : "photo";
	const labelSuffix = badgeLabel ? ` for ${badgeLabel}` : "";

	const isCaptureMode = Boolean(onCapture);
	const confirmBase = isCaptureMode
		? multiple
			? "Use photos"
			: "Use photo"
		: "Upload";
	const confirmLabel =
		multiple && photoCount > 0 ? `${confirmBase} · ${photoCount}` : confirmBase;
	const handleConfirm = async () => {
		if (onCapture) {
			onCapture(pendingPhotos.map((photo) => photo.file));
			onOpenChange(false);
			return;
		}
		await uploadMutation.mutateAsync();
	};

	// Shooting fills the screen with the viewfinder; reviewing hands the same photo surface
	// the lightbox uses to the stills, so a shot swipes and pinches identically before and
	// after it is uploaded.
	const isShooting = camera.isOpen;
	const lastPhoto = pendingPhotos.at(-1);
	const selectedIndex = pendingPhotos.findIndex(
		(photo) => photo.id === selectedPhotoId,
	);
	// A removed selection falls through to the newest shot rather than emptying the stage.
	const activeIndex = selectedIndex === -1 ? photoCount - 1 : selectedIndex;
	const selectedPhoto = pendingPhotos[activeIndex] ?? null;
	const stageItems = useMemo(
		() =>
			pendingPhotos.map((photo) => ({
				alt: `Preview ${photo.file.name}`,
				id: photo.id,
				image_url: photo.previewUrl,
			})),
		[pendingPhotos],
	);
	const handleIndexChange = (index: number) => {
		const photo = pendingPhotos[index];
		if (photo) {
			setSelectedPhotoId(photo.id);
		}
	};

	const cameraButtonLabel =
		photoCount === 0 ? "Open camera" : multiple ? "Camera" : "Retake";
	const placeholderText = cameraOnly
		? "Camera is required for this photo."
		: "Open the camera or pick from your device.";
	const hasNote = note.trim().length > 0;

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
					{isShooting
						? "Capture a photo with the camera or upload one from your device."
						: "Pinch or double-tap to zoom. Swipe to move between photos."}
				</DialogDescription>

				{/* Top chrome: close · position · item badge, over the viewfinder. The fast path
				    uploads from here so the shooting layout never gives up height for a button. */}
				<div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] pb-3">
					<button
						aria-label="Close"
						className="grid size-9 place-items-center justify-self-start rounded-full bg-white/10 text-white transition hover:bg-white/20"
						onClick={() => onOpenChange(false)}
						type="button"
					>
						<XIcon className="size-5" aria-hidden="true" />
					</button>

					{!isShooting && photoCount > 1 ? (
						<p className="justify-self-center font-mono text-xs text-white/70 tabular-nums">
							{activeIndex + 1} / {photoCount}
						</p>
					) : (
						<span />
					)}

					<div className="flex items-center justify-end gap-2 justify-self-end">
						{badgeLabel ? (
							<Badge
								className="border-white/40 bg-transparent text-white"
								variant="outline"
							>
								{badgeLabel}
							</Badge>
						) : null}
						{isShooting && photoCount > 0 ? (
							<Button
								className="bg-white font-semibold text-black hover:bg-white/90"
								disabled={isBusy}
								loading={isBusy}
								loadingText={isNormalizing ? "Processing..." : "Uploading..."}
								onClick={handleConfirm}
								size="sm"
								type="button"
							>
								{confirmLabel}
							</Button>
						) : null}
					</div>
				</div>

				{/* Live feed, reviewed still, or empty hint. */}
				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					{isShooting ? (
						<video
							ref={camera.previewRef}
							autoPlay
							muted
							playsInline
							onLoadedMetadata={camera.markReady}
							className="size-full object-contain"
						/>
					) : selectedPhoto ? (
						<PhotoStage
							activeIndex={activeIndex}
							items={stageItems}
							onIndexChange={handleIndexChange}
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

				{/* Bottom chrome: native-camera controls while shooting, photo actions while
				    reviewing. Neither mode reserves height for the other's controls. */}
				<div className="shrink-0 space-y-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)_+_1rem)]">
					{isShooting ? (
						<div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2">
							<div className="justify-self-start">
								{lastPhoto ? (
									<button
										aria-label={`Review ${photoCount} ${photoCount === 1 ? "photo" : "photos"}`}
										className="relative block size-14 overflow-hidden border border-white/40 bg-white/5 disabled:opacity-40"
										disabled={isBusy}
										onClick={() => reviewPhoto(lastPhoto.id)}
										type="button"
									>
										<img
											alt=""
											className="size-full object-cover"
											src={lastPhoto.previewUrl}
										/>
										{photoCount > 1 ? (
											<span className="absolute top-0 right-0 grid size-5 place-items-center bg-white text-[0.625rem] font-medium text-black tabular-nums">
												{photoCount}
											</span>
										) : null}
									</button>
								) : null}
							</div>

							<button
								aria-label="Capture photo"
								className="grid size-16 place-items-center justify-self-center rounded-full border-4 border-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
								disabled={!camera.isReady || isBusy}
								onClick={captureCameraPhoto}
								type="button"
							>
								<span className="size-12 rounded-full bg-white transition active:scale-90" />
							</button>

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
					) : (
						<>
							<div className="flex h-12 items-center gap-2">
								<button
									className="flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 font-medium text-sm text-white transition hover:bg-white/20 disabled:opacity-40"
									disabled={isBusy}
									onClick={() => void openCamera()}
									type="button"
								>
									<CameraIcon className="size-4" aria-hidden="true" />
									{cameraButtonLabel}
								</button>

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

								{withNote && photoCount > 0 ? (
									<button
										aria-expanded={isNoteOpen}
										aria-label={isNoteOpen ? "Hide note" : "Add note"}
										className={cn(
											"relative grid size-12 place-items-center rounded-full transition disabled:opacity-40",
											isNoteOpen
												? "bg-white text-black"
												: "bg-white/10 text-white hover:bg-white/20",
										)}
										disabled={isBusy}
										onClick={() => setIsNoteOpen((previous) => !previous)}
										type="button"
									>
										<PencilSimpleLineIcon
											className="size-5"
											aria-hidden="true"
										/>
										{hasNote && !isNoteOpen ? (
											<span className="absolute top-2 right-2 size-1.5 bg-white" />
										) : null}
									</button>
								) : null}

								{selectedPhoto ? (
									<button
										aria-label={`Remove ${selectedPhoto.file.name}`}
										className="ml-auto grid size-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
										disabled={isBusy}
										onClick={() => removePhoto(selectedPhoto.id)}
										type="button"
									>
										<TrashIcon className="size-5" aria-hidden="true" />
									</button>
								) : null}
							</div>

							{withNote && isNoteOpen ? (
								<Textarea
									value={note}
									onChange={(event) => setNote(event.target.value)}
									placeholder={
										photoCount > 1
											? `Note for all ${photoCount} photos`
											: "Optional note"
									}
									rows={2}
									maxLength={200}
									disabled={isBusy}
									aria-label={`Photo note${labelSuffix}`}
									className="border-white/20 bg-white/5 text-white placeholder:text-white/50 disabled:opacity-50"
								/>
							) : null}

							{photoCount > 0 ? (
								<Button
									className="h-14 w-full bg-white font-semibold text-base text-black hover:bg-white/90"
									type="button"
									disabled={isBusy}
									loading={isBusy}
									loadingText={isNormalizing ? "Processing..." : "Uploading..."}
									onClick={handleConfirm}
								>
									{confirmLabel}
								</Button>
							) : null}
						</>
					)}

					{cameraOnly ? null : (
						<input
							ref={fileInputRef}
							type="file"
							aria-label={`Choose ${photoNoun}${labelSuffix}`}
							accept={ACCEPTED_IMAGE_TYPES.join(",")}
							multiple={multiple}
							className="sr-only"
							onChange={(event) => {
								void addFiles(Array.from(event.target.files ?? []));
							}}
						/>
					)}
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
