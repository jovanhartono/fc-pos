import { useMutation } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	type RefObject,
	use,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	type PhotoCaptureLabels,
	resolvePhotoCaptureLabels,
} from "@/features/orders/components/photo-capture-labels";
import type { PhotoStageItem } from "@/features/orders/components/photo-stage";
import {
	type UseCameraCaptureResult,
	useCameraCapture,
} from "@/features/orders/hooks/useCameraCapture";
import { normalizeImageFile } from "@/features/orders/utils/normalize-image";
import {
	isAcceptedImage,
	type PhotoUploader,
	resolveUploadedKey,
} from "@/features/orders/utils/photo-upload";
import { readServerErrorMessage } from "@/lib/server-error";

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

interface PhotoCaptureState {
	activeIndex: number;
	// Only what the viewfinder needs to draw itself. The raw hook's `capture` would
	// take a shot without staging or uploading it, and its `stop`/`open` are already
	// out on `actions` — one name per operation.
	camera: Pick<
		UseCameraCaptureResult,
		"error" | "isReady" | "markReady" | "previewRef"
	>;
	fileInputRef: RefObject<HTMLInputElement | null>;
	isBusy: boolean;
	isNoteOpen: boolean;
	isShooting: boolean;
	lastPhoto: PendingPhoto | undefined;
	note: string;
	photoCount: number;
	selectedPhoto: PendingPhoto | null;
	stageItems: PhotoStageItem[];
}

interface PhotoCaptureActions {
	addFiles: (files: File[]) => Promise<void>;
	captureCameraPhoto: () => Promise<void>;
	confirm: () => void;
	onOpenChange: (open: boolean) => void;
	openCamera: () => Promise<void>;
	openFileInput: () => void;
	removePhoto: (photoId: string) => void;
	resetDialogState: () => void;
	reviewPhoto: (photoId: string) => void;
	selectPhotoAt: (index: number) => void;
	setNote: (value: string) => void;
	stopCamera: () => void;
	toggleNote: () => void;
}

interface PhotoCaptureMeta {
	badgeLabel?: string;
	isMultiple: boolean;
	labels: PhotoCaptureLabels;
	open: boolean;
	title: string;
}

interface PhotoCaptureContextValue {
	actions: PhotoCaptureActions;
	meta: PhotoCaptureMeta;
	state: PhotoCaptureState;
}

const PhotoCaptureContext = createContext<PhotoCaptureContextValue | null>(
	null,
);

export const usePhotoCapture = () => {
	const context = use(PhotoCaptureContext);
	if (!context) {
		throw new Error("usePhotoCapture must be used within PhotoCaptureProvider");
	}
	return context;
};

interface PhotoCaptureCommonProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	badgeLabel?: string;
	children: ReactNode;
	autoOpenCamera?: boolean;
}

type PhotoCaptureTargetProps =
	| {
			variant: "batch-upload" | "single-upload";
			uploader?: PhotoUploader;
			onUploaded?: () => Promise<void>;
			onCapture?: never;
	  }
	| {
			variant: "single-capture";
			uploader?: never;
			onUploaded?: never;
			onCapture: (files: File[]) => void;
	  };

type PhotoCaptureProviderProps = PhotoCaptureCommonProps &
	PhotoCaptureTargetProps;

export const PhotoCaptureProvider = ({
	open,
	onOpenChange,
	title,
	badgeLabel,
	children,
	variant,
	uploader,
	onUploaded,
	onCapture,
	autoOpenCamera = false,
}: PhotoCaptureProviderProps) => {
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

	const isMultiple = variant === "batch-upload";
	const isCaptureMode = variant === "single-capture";

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
			if (!uploader || isCaptureMode || !isAcceptedImage(contentType)) {
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
		[isCaptureMode, uploader],
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
			if (!isMultiple) {
				discardPhotos(pendingRef.current);
			}
			setPendingPhotos((previous) =>
				isMultiple ? [...previous, ...created] : created,
			);
			const newest = created.at(-1);
			if (newest) {
				setSelectedPhotoId(newest.id);
			}
		},
		[beginPush, isMultiple],
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

			const accepted = isMultiple ? files : files.slice(0, 1);
			const session = sessionRef.current;

			const normalized: File[] = [];
			try {
				for (const [index, file] of accepted.entries()) {
					setNormalizing({ done: index, total: accepted.length });
					try {
						normalized.push(await normalizeImageFile(file));
					} catch (error) {
						toast.error(
							`${readServerErrorMessage(error, "Unsupported image type")}: ${file.name}`,
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
		[isMultiple, stagePhotos],
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
		if (!isMultiple) {
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

			const trimmedNote = note.trim() || undefined;
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
	const photoCount = pendingPhotos.length;

	const confirm = () => {
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
	const selectedIndex = pendingPhotos.findIndex(
		(photo) => photo.id === selectedPhotoId,
	);
	// A removed selection falls through to the newest shot rather than emptying the stage.
	const activeIndex = selectedIndex === -1 ? photoCount - 1 : selectedIndex;
	const stageItems = useMemo(
		() =>
			pendingPhotos.map((photo) => ({
				alt: `Preview ${photo.file.name}`,
				id: photo.id,
				image_url: photo.previewUrl,
			})),
		[pendingPhotos],
	);
	const selectPhotoAt = (index: number) => {
		const photo = pendingPhotos[index];
		if (photo) {
			setSelectedPhotoId(photo.id);
		}
	};

	const value: PhotoCaptureContextValue = {
		actions: {
			addFiles,
			captureCameraPhoto,
			confirm,
			onOpenChange,
			openCamera,
			openFileInput,
			removePhoto,
			resetDialogState,
			reviewPhoto,
			selectPhotoAt,
			setNote,
			stopCamera,
			toggleNote: () => setIsNoteOpen((previous) => !previous),
		},
		meta: {
			badgeLabel,
			isMultiple,
			labels: resolvePhotoCaptureLabels({
				badgeLabel,
				normalizing,
				photoCount,
				uploading,
				variant,
			}),
			open,
			title,
		},
		state: {
			activeIndex,
			camera,
			fileInputRef,
			isBusy,
			isNoteOpen,
			isShooting,
			lastPhoto: pendingPhotos.at(-1),
			note,
			photoCount,
			selectedPhoto: pendingPhotos[activeIndex] ?? null,
			stageItems,
		},
	};

	return <PhotoCaptureContext value={value}>{children}</PhotoCaptureContext>;
};
