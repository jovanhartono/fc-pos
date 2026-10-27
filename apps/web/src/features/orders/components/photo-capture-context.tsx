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

// Started when the photo hit the strip, not on confirm.
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

// Abort as well as revoke: a retaken photo would otherwise compete with its
// replacement for the shop's uplink and land in the bucket with nothing pointing at it.
const discardPhotos = (photos: PendingPhoto[]) => {
	for (const photo of photos) {
		photo.upload?.abort();
		URL.revokeObjectURL(photo.previewUrl);
	}
};

interface PhotoCaptureState {
	activeIndex: number;
	// Not the raw `capture`: it would take a photo without staging or uploading it.
	camera: Pick<
		UseCameraCaptureResult,
		"error" | "isReady" | "markReady" | "previewRef"
	>;
	fileInputRef: RefObject<HTMLInputElement | null>;
	isBusy: boolean;
	isNoteOpen: boolean;
	isShooting: boolean;
	// Narrower than isBusy: a scale-down can still be abandoned, a batch part-way onto the
	// order cannot.
	isUploading: boolean;
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
		// A scale-down finishing after staff gave up on the dialog must not land its
		// photo on the next Order.
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

	// The reset waits for the close animation (no layout shift), which an unmount
	// never reaches; without this, staged photos leak in a POS tab open all day.
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

	// Uploads go one at a time: one already fills the shop's uplink, and five at
	// once make the first, the one confirm waits on, slowest of all.
	const pushQueueRef = useRef<Promise<unknown>>(Promise.resolve());

	// Upload starts at staging, not confirm, so it runs while staff shoot the next
	// photo or type a note. An abandoned batch's files go in the nightly photo sweep.
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
			// Catch now: an upload dropped on 4G before confirm would be an unhandled
			// rejection. Confirm still retries it, and the next upload isn't stranded.
			pushQueueRef.current = promise.catch(() => undefined);
			return { abort: () => controller.abort(), promise };
		},
		[isCaptureMode, uploader],
	);

	// Photos from this dialog's camera are already scaled and encoded, so they hit
	// the strip in the same frame as the shutter press.
	const stagePhotos = useCallback(
		(files: File[]) => {
			const created = files.map((file) =>
				createPendingPhoto(file, beginPush(file)),
			);
			// Discard outside the updater: React may replay it, which would cancel the
			// upload of a photo still on the strip.
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

	// Gallery photos: a 12MP photo is scaled down before it reaches 4G, and an
	// iPhone HEIC becomes a JPEG or is refused here, never stored unviewable.
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
		// Single-photo flows stop so the still replaces the live feed; multiple-photo
		// flows keep the camera open for the next shot.
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

			// Saved one by one in shot order: the gallery sorts by save order, and a
			// shuffled before/after pair loses its point.
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
			toast.error(readServerErrorMessage(error, "Couldn't upload photos"));
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

	// Scaling counts as busy: confirming mid-scale saved only some photos, said
	// success, and dropped the rest.
	const isNormalizing = normalizing !== null;
	const isBusy = uploadMutation.isPending || isNormalizing;
	const photoCount = pendingPhotos.length;

	// Saved photos can't be taken back, so the dialog stays up until the batch
	// finishes. Close on success skips this: the mutation still reads as pending there.
	const requestOpenChange = (next: boolean) => {
		if (!next && uploadMutation.isPending) {
			return;
		}
		onOpenChange(next);
	};

	const confirm = () => {
		if (onCapture) {
			onCapture(pendingPhotos.map((photo) => photo.file));
			onOpenChange(false);
			return;
		}
		// mutate, not mutateAsync: onError reports it, and an unawaited mutateAsync
		// logged an uncaught rejection per failed batch.
		uploadMutation.mutate();
	};

	// Review uses the lightbox's photo surface, so a photo swipes and pinches the
	// same before and after upload.
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
			onOpenChange: requestOpenChange,
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
			isUploading: uploadMutation.isPending,
			lastPhoto: pendingPhotos.at(-1),
			note,
			photoCount,
			selectedPhoto: pendingPhotos[activeIndex] ?? null,
			stageItems,
		},
	};

	return <PhotoCaptureContext value={value}>{children}</PhotoCaptureContext>;
};
