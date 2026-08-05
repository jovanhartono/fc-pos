import {
	CameraIcon,
	CheckIcon,
	CircleNotchIcon,
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
	type PhotoUploader,
	resolveUploadedKey,
} from "@/features/orders/utils/photo-upload";
import { readServerErrorMessage } from "@/lib/server-error";
import { cn } from "@/lib/utils";

// Bytes already on their way up, started when the photo hit the strip rather than on confirm.
// Resolves to the stored key the commit needs.
interface PendingUpload {
	promise: Promise<string>;
	abort: () => void;
}

interface PendingPhoto {
	id: string;
	file: File;
	previewUrl: string;
	// Undefined in capture-only mode, and for a file whose type the confirm is going to reject
	// anyway.
	upload?: PendingUpload;
}

const createPendingPhoto = (
	file: File,
	upload?: PendingUpload,
): PendingPhoto => ({
	file,
	id: crypto.randomUUID(),
	previewUrl: URL.createObjectURL(file),
	upload,
});

// Everything a photo leaving the strip has to let go of. The abort matters as much as the
// revoke now that bytes start moving at staging time: a retaken shot would otherwise keep
// competing with its replacement for the same uplink, and would land in the bucket with
// nothing pointing at it. Safe over a batch that already finished — aborting then does nothing.
const discardPhotos = (photos: PendingPhoto[]) => {
	for (const photo of photos) {
		photo.upload?.abort();
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
	// Upload mode: push bytes → commit on confirm.
	uploader?: PhotoUploader;
	onUploaded?: () => Promise<void>;
	// Capture-only mode: hand the picked File(s) back instead of uploading. Used
	// at the POS where the Order does not exist yet, so the upload is deferred to
	// after checkout commits. When set, uploader/onUploaded are ignored.
	onCapture?: (files: File[]) => void;
	// Skip the chooser and go straight to the viewfinder. For intake flows where a
	// live photo is the expected answer and the gallery is the exception — the
	// picker is still in the shutter row. See SinglePhotoCaptureDialog.
	autoOpenCamera?: boolean;
}

const PhotoUploadDialogBase = ({
	open,
	onOpenChange,
	title,
	badgeLabel,
	multiple,
	withNote,
	uploader,
	onUploaded,
	onCapture,
	autoOpenCamera = false,
}: PhotoUploadDialogBaseProps) => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const camera = useCameraCapture();
	const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
	const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
	const [note, setNote] = useState("");
	const [isNoteOpen, setIsNoteOpen] = useState(false);
	// Which of a picked batch is being scaled down. A 12MP gallery photo takes long enough
	// that the cashier retaps thinking nothing happened, so the count is worth carrying.
	const [normalizing, setNormalizing] = useState<{
		done: number;
		total: number;
	} | null>(null);
	// How far the confirm has got through the batch, and which photos are already saved so a
	// retry after a mid-batch failure does not upload them twice.
	const [uploading, setUploading] = useState<{
		done: number;
		total: number;
	} | null>(null);
	const committedRef = useRef<string[]>([]);
	const sessionRef = useRef(0);

	const stopCamera = camera.stop;
	const openCamera = camera.open;
	const resetDialogState = useCallback(() => {
		stopCamera();
		setPendingPhotos((previous) => {
			discardPhotos(previous);
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
		setNormalizing(null);

		if (!open) {
			return;
		}
		// Intake flows: skip the chooser, go straight to the live camera.
		if (autoOpenCamera) {
			void openCamera();
		}
	}, [open, autoOpenCamera, openCamera]);

	// Release the camera and the previews if the dialog unmounts while still open. The
	// visual reset is deferred to onOpenChangeComplete so the popup keeps its full height
	// through the close animation instead of collapsing and re-centering first — that snap
	// was the layout shift — but an unmount never reaches that callback. Navigating off the
	// order, advancing the checkout step or switching queue item with shots still staged
	// would otherwise strand a blob per photo for as long as the tab lives, and the till
	// tab lives all day.
	const pendingRef = useRef<PendingPhoto[]>([]);
	useEffect(() => {
		pendingRef.current = pendingPhotos;
	});
	useEffect(
		() => () => {
			stopCamera();
			discardPhotos(pendingRef.current);
		},
		[stopCamera],
	);

	// Tail of the staged uploads, so a new one queues behind them instead of racing them. One
	// upload already saturates a shop uplink: firing a five-photo gallery pick together makes
	// every photo slower and the first one — the one confirm waits on first — slowest of all.
	const pushQueueRef = useRef<Promise<unknown>>(Promise.resolve());

	// The upload starts here, not on confirm. Between staging a shot and confirming the batch the
	// operator is shooting the next one, swiping back through the last one or typing a note —
	// seconds the bytes can spend crossing the shop uplink instead, which is the slowest step
	// between the cashier and the stored evidence. By confirm there is usually only the commit.
	//
	// What this accepts: a batch the operator abandons leaves bytes in the bucket with no row
	// pointing at them. The browser cannot clean those up, so the server sweeps them nightly.
	const beginPush = useCallback(
		(file: File): PendingUpload | undefined => {
			const contentType = file.type;
			if (!uploader || onCapture || !isAcceptedImage(contentType)) {
				return undefined;
			}

			const controller = new AbortController();
			const promise = pushQueueRef.current.then(() =>
				uploader.pushBytes({
					contentType,
					file,
					signal: controller.signal,
				}),
			);
			// Nothing awaits this until confirm, so claim the failure now: a push that dies in
			// between — dropped 4G, the shot retaken — would otherwise surface as an unhandled
			// rejection. Confirm still sees it and still retries. The swallowed copy is also what
			// the next push queues on, so one failure does not strand the rest of the batch.
			pushQueueRef.current = promise.catch(() => undefined);
			return { abort: () => controller.abort(), promise };
		},
		[onCapture, uploader],
	);

	// Photos this dialog produced itself. The capture canvas already scaled them into
	// budget and encoded them in the upload format, so there is nothing left to decode or
	// check and they go on the strip in the same frame as the shutter press.
	const stagePhotos = useCallback(
		(files: File[]) => {
			const created = files.map((file) =>
				createPendingPhoto(file, beginPush(file)),
			);
			// Discarding happens out here, not inside the updater. React may run an updater more
			// than once for a single commit, and aborting a push twice is harmless only as long as
			// the photo really is leaving — a replayed updater would otherwise cancel the upload
			// of a shot still sitting on the strip and revoke the preview it is being shown from.
			if (!multiple) {
				discardPhotos(pendingRef.current);
			}
			setPendingPhotos((previous) =>
				multiple ? [...previous, ...created] : created,
			);
			const newest = created.at(-1);
			if (newest) {
				setSelectedPhotoId(newest.id);
			}
		},
		[beginPush, multiple],
	);

	// Photos arriving from the device gallery, where nothing is known about them yet: a
	// 12MP phone photo is scaled down before it ever reaches 4G, and an iPhone HEIC either
	// becomes a JPEG here or is rejected here rather than sitting in S3 as unviewable
	// dispute evidence. Slow enough on a real photo to need the progress overlay.
	const addFiles = useCallback(
		async (files: File[]) => {
			if (files.length === 0) {
				return;
			}

			const accepted = multiple ? files : files.slice(0, 1);
			const session = sessionRef.current;

			const normalized: File[] = [];
			try {
				for (const [index, file] of accepted.entries()) {
					setNormalizing({ done: index, total: accepted.length });
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
					setNormalizing(null);
				}
			}

			if (normalized.length === 0) {
				return;
			}

			stagePhotos(normalized);
		},
		[multiple, stagePhotos],
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
		const shot = await camera.capture();
		if (!shot) {
			return;
		}

		const timestamp = Date.now();
		stagePhotos([
			new File([shot.blob], `photo-${timestamp}.${shot.extension}`, {
				type: shot.type,
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
		const removed = pendingRef.current.find((photo) => photo.id === photoId);
		if (removed) {
			discardPhotos([removed]);
		}
		setPendingPhotos((previous) =>
			previous.filter((photo) => photo.id !== photoId),
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
			if (!uploader) {
				return;
			}

			const validatedPhotos = pendingPhotos.map((photo) => {
				const contentType = photo.file.type;
				if (!isAcceptedImage(contentType)) {
					throw new Error(`Unsupported image type: ${photo.file.name}`);
				}
				return { ...photo, contentType };
			});

			const trimmedNote = withNote ? note.trim() || undefined : undefined;
			committedRef.current = [];

			// Only the commits are left — every photo's bytes started moving when it was staged.
			// They stay in shot order because the gallery sorts on the row id a commit assigns,
			// and a before/after pair that comes back shuffled loses the point of the photo.
			for (const [index, photo] of validatedPhotos.entries()) {
				setUploading({ done: index, total: validatedPhotos.length });
				const input = {
					contentType: photo.contentType,
					file: photo.file,
					note: trimmedNote,
				};

				const key = await resolveUploadedKey(
					uploader,
					input,
					photo.upload?.promise,
				);

				await uploader.commit(key, input);
				committedRef.current.push(photo.id);
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
			// Photos already in the database have to leave the strip, or tapping Upload again
			// saves a second copy of every one that had landed before the failure.
			for (const photoId of committedRef.current) {
				removePhoto(photoId);
			}
			committedRef.current = [];
		},
		onSettled: () => {
			setUploading(null);
		},
	});

	// Normalizing counts as busy: confirming while a pick is still being scaled down uploaded
	// only the photos that had landed, toasted success, and dropped the rest of the evidence.
	const isNormalizing = normalizing !== null;
	const isBusy = uploadMutation.isPending || isNormalizing;
	// Picking from the gallery before any photo exists leaves nothing on screen to hang a
	// spinner off — the only feedback was the picker icon dimming, which read as a dead
	// button and got retapped. The stage carries it instead, so every mode shows it, and the
	// confirm button is free to stay narrow enough to sit beside the shutter without
	// "Uploading 4 of 5..." growing into it.
	const normalizeLabel =
		normalizing && normalizing.total > 1
			? `Processing ${normalizing.done + 1} of ${normalizing.total}...`
			: "Processing...";
	const uploadLabel =
		uploading && uploading.total > 1
			? `Uploading ${uploading.done + 1} of ${uploading.total}...`
			: "Uploading...";
	const busyLabel = isNormalizing ? normalizeLabel : uploadLabel;
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
	// The shutter row has no width to spare for a word, so the count stays on the review
	// square and the tick carries the action. Assistive tech still gets the full sentence.
	const confirmAriaLabel =
		photoCount > 1 ? `${confirmBase}, ${photoCount} photos` : confirmBase;
	const handleConfirm = () => {
		if (onCapture) {
			onCapture(pendingPhotos.map((photo) => photo.file));
			onOpenChange(false);
			return;
		}
		// mutate, not mutateAsync: onError already reports the failure, and the rejected
		// promise mutateAsync hands back had nobody awaiting it on an onClick, so every
		// failed batch also logged an uncaught rejection.
		uploadMutation.mutate();
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

	// Only ever rendered with a shot already in hand — the empty state has its own button.
	const cameraButtonLabel = multiple ? "Camera" : "Retake";
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

				{/* Top chrome: close · position · item badge, over the viewfinder. Actions live in
				    the bottom bar within thumb reach — nothing up here is a tap target but Close. */}
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

					<div className="justify-self-end">
						{badgeLabel ? (
							<Badge
								className="border-white/40 bg-transparent text-white"
								variant="outline"
							>
								{badgeLabel}
							</Badge>
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
						// No sentence: the two buttons below already say what they do, and saying it
						// twice put a second focal point in the middle of an otherwise empty screen.
						<div className="grid size-full place-items-center">
							<CameraIcon
								className="size-10 text-white/40"
								aria-hidden="true"
							/>
						</div>
					)}

					{isBusy ? (
						<div
							aria-live="polite"
							className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 text-sm text-white"
							role="status"
						>
							<CircleNotchIcon className="size-7 animate-spin" />
							<p>{busyLabel}</p>
						</div>
					) : null}

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

							{/* Finish the batch from where a document scanner puts it: bottom-right,
							    beside the shot count, both a thumb's width from the shutter. Squared
							    off rather than round, so a white circle beside the shutter is never
							    mistaken for a second one. The picker gives up the slot once a shot
							    exists — mid-batch gallery picks are rare, and it is still one tap
							    behind the review square. */}
							<div className="justify-self-end">
								{photoCount > 0 ? (
									<button
										aria-label={confirmAriaLabel}
										className="grid size-14 place-items-center bg-white text-black transition hover:bg-white/90 disabled:opacity-40"
										disabled={isBusy}
										onClick={handleConfirm}
										type="button"
									>
										{isBusy ? (
											<CircleNotchIcon className="size-6 animate-spin" />
										) : (
											<CheckIcon className="size-7" aria-hidden="true" />
										)}
									</button>
								) : (
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
					) : photoCount === 0 ? (
						// Nothing captured yet, so there is only one thing to do: the camera takes the
						// width and the fill that the confirm button takes once there is something to
						// confirm, and the picker sits beside it as the exception it is.
						<div className="flex h-14 items-center gap-2">
							<button
								className="flex h-14 flex-1 items-center justify-center gap-2 bg-white font-semibold text-base text-black transition hover:bg-white/90 disabled:opacity-40"
								disabled={isBusy}
								onClick={() => void openCamera()}
								type="button"
							>
								<CameraIcon className="size-5" aria-hidden="true" />
								Open camera
							</button>

							<button
								aria-label="Upload from device"
								className="grid size-14 place-items-center border border-white/30 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
								disabled={isBusy}
								onClick={openFileInput}
								type="button"
							>
								<ImageSquareIcon className="size-6" aria-hidden="true" />
							</button>
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

								<button
									aria-label="Upload from device"
									className="grid size-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
									disabled={isBusy}
									onClick={openFileInput}
									type="button"
								>
									<ImageSquareIcon className="size-5" aria-hidden="true" />
								</button>

								{withNote ? (
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
									onClick={handleConfirm}
								>
									{confirmLabel}
								</Button>
							) : null}
						</>
					)}

					<input
						ref={fileInputRef}
						type="file"
						aria-label={`Choose ${photoNoun}${labelSuffix}`}
						accept={ACCEPTED_IMAGE_TYPES.join(",")}
						multiple={multiple}
						className="sr-only"
						onChange={(event) => {
							const files = Array.from(event.target.files ?? []);
							// A gallery pick used to land behind a still-running viewfinder, so the
							// photo the cashier just chose was nowhere on screen. Cancelling the
							// picker (no files) must leave the camera alone.
							if (files.length > 0) {
								stopCamera();
							}
							void addFiles(files);
						}}
					/>
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
	"open" | "onOpenChange" | "title" | "badgeLabel" | "autoOpenCamera"
> & {
	onCapture: (file: File) => void;
};

// Capture-only single-photo dialog. Reuses the full-screen camera/picker/preview
// UI but, instead of uploading, hands the picked File back to the caller — for
// flows where the target row does not exist yet (POS drop-off photo before
// checkout) or where the upload is bundled with other data (pickup event).
//
// Opens on the viewfinder by default: drop-off is an intake action, so a live
// photo of the items in front of the cashier is the expected answer. It is no
// longer the only one — a store whose iPad camera is refused or broken can still
// finish the drop-off from the gallery. Pass autoOpenCamera={false} for flows
// that should land on the chooser instead (e.g. pickup).
export const SinglePhotoCaptureDialog = ({
	onCapture,
	autoOpenCamera = true,
	...props
}: SinglePhotoCaptureDialogProps) => (
	<PhotoUploadDialogBase
		{...props}
		multiple={false}
		withNote={false}
		autoOpenCamera={autoOpenCamera}
		onCapture={(files) => {
			const [file] = files;
			if (file) {
				onCapture(file);
			}
		}}
	/>
);
