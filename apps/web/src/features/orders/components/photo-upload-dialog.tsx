import {
	CameraIcon,
	ImageSquareIcon,
	TrashIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
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

interface PhotoUploadDialogBaseProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	badgeLabel?: string;
	multiple: boolean;
	withNote: boolean;
	uploadPhoto: (input: UploadPhotoInput) => Promise<void>;
	onUploaded: () => Promise<void>;
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
}: PhotoUploadDialogBaseProps) => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const camera = useCameraCapture();
	const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
	const [note, setNote] = useState("");

	const stopCamera = camera.stop;
	const resetDialogState = useCallback(() => {
		stopCamera();
		setPendingPhotos((previous) => {
			revokePhotos(previous);
			return [];
		});
		setNote("");
	}, [stopCamera]);

	useEffect(() => {
		if (!open) {
			return;
		}
		return resetDialogState;
	}, [open, resetDialogState]);

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

			setPendingPhotos((previous) => {
				if (!multiple) {
					revokePhotos(previous);
					return accepted.map((file) => createPendingPhoto(file));
				}
				return [
					...previous,
					...accepted.map((file) => createPendingPhoto(file)),
				];
			});
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
			for (const photo of validatedPhotos) {
				await uploadPhoto({
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
			await onUploaded();
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to upload photos");
		},
	});

	const handleClear = () => {
		setPendingPhotos((previous) => {
			revokePhotos(previous);
			return [];
		});
		setNote("");
	};

	const photoNoun = multiple ? "photos" : "photo";
	const labelSuffix = badgeLabel ? ` for ${badgeLabel}` : "";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center justify-between gap-3 pr-8">
						<span>{title}</span>
						{badgeLabel ? (
							<Badge variant="outline" className="shrink-0">
								{badgeLabel}
							</Badge>
						) : null}
					</DialogTitle>
				</DialogHeader>

				<div className="grid gap-4">
					<div className="grid gap-2 sm:grid-cols-2">
						<Button
							type="button"
							variant="outline"
							className="h-12 justify-start"
							icon={<CameraIcon className="size-4" />}
							disabled={uploadMutation.isPending || camera.isOpen}
							onClick={camera.open}
						>
							Camera
						</Button>
						<Button
							type="button"
							variant="outline"
							className="h-12 justify-start"
							icon={<ImageSquareIcon className="size-4" />}
							disabled={uploadMutation.isPending}
							onClick={openFileInput}
						>
							Upload from device
						</Button>
					</div>

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

					{camera.isOpen ? (
						<div className="grid gap-3 border border-border bg-muted/20 p-3">
							<video
								ref={camera.previewRef}
								autoPlay
								muted
								playsInline
								onLoadedMetadata={camera.markReady}
								className="aspect-[4/3] w-full border border-border bg-black object-cover"
							/>

							{camera.error ? (
								<div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
									<WarningCircleIcon
										className="mt-0.5 size-4 shrink-0"
										weight="fill"
									/>
									<span>{camera.error}</span>
								</div>
							) : null}

							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
								<Button
									type="button"
									variant="outline"
									disabled={uploadMutation.isPending}
									onClick={camera.stop}
								>
									Cancel
								</Button>
								<Button
									type="button"
									disabled={!camera.isReady || uploadMutation.isPending}
									onClick={captureCameraPhoto}
								>
									{camera.isReady ? "Capture" : "Loading..."}
								</Button>
							</div>
						</div>
					) : null}

					{pendingPhotos.length > 0 ? (
						<div className="grid gap-3">
							<div className="flex items-center justify-between gap-3">
								<p className="text-sm font-medium">
									{multiple
										? `Pending photos (${pendingPhotos.length})`
										: "Pending photo"}
								</p>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={uploadMutation.isPending}
									onClick={handleClear}
								>
									Clear
								</Button>
							</div>
							<div
								className={cn(
									"grid gap-2",
									multiple ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1",
								)}
							>
								{pendingPhotos.map((photo) => (
									<div key={photo.id} className="relative border border-border">
										<img
											src={photo.previewUrl}
											alt={`Preview ${photo.file.name}`}
											width={480}
											height={360}
											className="aspect-[4/3] w-full object-cover"
										/>
										<Button
											type="button"
											size="icon-sm"
											variant="secondary"
											className="absolute top-1 right-1 bg-background/90"
											disabled={uploadMutation.isPending}
											onClick={() => removePhoto(photo.id)}
										>
											<TrashIcon className="size-3.5" />
											<span className="sr-only">Remove {photo.file.name}</span>
										</Button>
									</div>
								))}
							</div>
							{withNote ? (
								<Textarea
									value={note}
									onChange={(event) => setNote(event.target.value)}
									placeholder="Optional note"
									rows={2}
									maxLength={200}
									disabled={uploadMutation.isPending}
									aria-label={`Photo note${labelSuffix}`}
								/>
							) : null}
						</div>
					) : (
						<div
							className={cn(
								"border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground",
								camera.isOpen && "hidden",
							)}
						>
							{multiple ? "No photos selected." : "No photo selected."}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={uploadMutation.isPending}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={pendingPhotos.length === 0 || uploadMutation.isPending}
						loading={uploadMutation.isPending}
						loadingText="Uploading..."
						onClick={async () => {
							await uploadMutation.mutateAsync();
						}}
					>
						Upload
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

type PhotoUploadDialogProps = Omit<
	PhotoUploadDialogBaseProps,
	"multiple" | "withNote"
>;

export const PhotoUploadDialog = (props: PhotoUploadDialogProps) => (
	<PhotoUploadDialogBase {...props} multiple withNote />
);

export const SinglePhotoUploadDialog = (props: PhotoUploadDialogProps) => (
	<PhotoUploadDialogBase {...props} multiple={false} withNote={false} />
);
