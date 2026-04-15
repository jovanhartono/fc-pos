import { ORDER_STATUS_TRANSITIONS } from "@fresclean/api/schema";
import {
	ArrowLeftIcon,
	CameraIcon,
	ImageSquareIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { HoldToConfirmButton } from "@/features/orders/components/hold-to-confirm-button";
import { OrderPhotoGallery } from "@/features/orders/components/order-photo-gallery";
import { StatusTimeline } from "@/features/orders/components/status-timeline";
import {
	presignOrderServicePhoto,
	queryKeys,
	saveOrderServicePhoto,
	type UpdateOrderServiceStatusPayload,
	updateOrderServiceStatus,
	uploadFileToPresignedUrl,
} from "@/lib/api";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";
import { orderDetailQueryOptions } from "@/lib/query-options";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/stores/auth-store";

const WORKER_BLOCKED_QUEUE_STATUSES = new Set<
	UpdateOrderServiceStatusPayload["status"]
>(["cancelled", "refunded"]);

function QueueServiceDetailSkeleton() {
	return (
		<div className="grid gap-5">
			<div className="flex items-center gap-3">
				<Skeleton className="size-9" />
				<Skeleton className="h-8 w-48" />
			</div>
			<Skeleton className="h-12 w-full" />
			<div className="grid gap-3">
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		</div>
	);
}

function QueueServiceDetailMessage({
	description,
	title,
	tone,
}: {
	description: string;
	title: string;
	tone: "error" | "muted";
}) {
	return (
		<div
			className={cn(
				"grid gap-1 border border-border/70 bg-muted/30 p-6 text-sm",
				tone === "error" && "border-destructive/40 bg-destructive/5",
			)}
		>
			<p className="font-medium">{title}</p>
			<p className="text-muted-foreground">{description}</p>
		</div>
	);
}

type QueueServiceDetailProps = {
	orderId: number;
	serviceId: number;
	queueStoreId?: number;
};

export function QueueServiceDetail({
	orderId,
	serviceId,
	queueStoreId,
}: QueueServiceDetailProps) {
	const queryClient = useQueryClient();
	const currentUser = getCurrentUser();
	const galleryInputRef = useRef<HTMLInputElement | null>(null);
	const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
	const cameraStreamRef = useRef<MediaStream | null>(null);

	const [statusNote, setStatusNote] = useState("");
	const [photoNote, setPhotoNote] = useState("");
	const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
	const [selectedPhotoPreviewUrl, setSelectedPhotoPreviewUrl] = useState<
		string | null
	>(null);
	const [isCameraOpen, setIsCameraOpen] = useState(false);
	const [cameraError, setCameraError] = useState<string | null>(null);

	const openGalleryInput = (input: HTMLInputElement | null) => {
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

	const stopCameraStream = useCallback(() => {
		if (cameraStreamRef.current) {
			for (const track of cameraStreamRef.current.getTracks()) {
				track.stop();
			}
			cameraStreamRef.current = null;
		}

		if (cameraPreviewRef.current) {
			cameraPreviewRef.current.srcObject = null;
		}

		setIsCameraOpen(false);
	}, []);

	const openCamera = async () => {
		setCameraError(null);

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
				audio: false,
			});

			cameraStreamRef.current = stream;
			setIsCameraOpen(true);
		} catch {
			setCameraError("Unable to open the camera on this device.");
			stopCameraStream();
		}
	};

	const captureCameraPhoto = async () => {
		const video = cameraPreviewRef.current;
		if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
			setCameraError("Camera preview is not ready yet.");
			return;
		}

		const canvas = document.createElement("canvas");
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;

		const context = canvas.getContext("2d");
		if (!context) {
			setCameraError("Unable to capture a photo right now.");
			return;
		}

		context.drawImage(video, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, "image/jpeg", 0.92);
		});

		if (!blob) {
			setCameraError("Unable to capture a photo right now.");
			return;
		}

		const timestamp = Date.now();
		setSelectedPhotoFile(
			new File([blob], `queue-camera-${serviceId}-${timestamp}.jpg`, {
				type: "image/jpeg",
			}),
		);
		stopCameraStream();
	};

	const detailQuery = useQuery(orderDetailQueryOptions(orderId));
	const detail = detailQuery.data;
	const selectedService = detail?.services.find(
		(service) => service.id === serviceId,
	);

	useEffect(() => {
		if (!selectedPhotoFile) {
			setSelectedPhotoPreviewUrl(null);
			return;
		}

		const objectUrl = URL.createObjectURL(selectedPhotoFile);
		setSelectedPhotoPreviewUrl(objectUrl);

		return () => URL.revokeObjectURL(objectUrl);
	}, [selectedPhotoFile]);

	useEffect(() => {
		const stream = cameraStreamRef.current;
		const preview = cameraPreviewRef.current;

		if (!isCameraOpen || !stream || !preview) {
			return;
		}

		preview.srcObject = stream;
		void preview.play().catch(() => {
			setCameraError("Camera preview is unavailable on this device.");
		});

		return () => {
			if (preview.srcObject === stream) {
				preview.srcObject = null;
			}
		};
	}, [isCameraOpen]);

	useEffect(() => {
		return () => {
			stopCameraStream();
		};
	}, [stopCameraStream]);

	const refreshData = async (storeId?: number) => {
		await queryClient.invalidateQueries({
			queryKey: queryKeys.orderDetail(orderId),
		});
		if (storeId !== undefined) {
			await queryClient.invalidateQueries({
				queryKey: queryKeys.orderServiceQueue({ store_id: storeId }),
			});
		}
	};

	const startWorkMutation = useMutation({
		mutationFn: () =>
			updateOrderServiceStatus(orderId, serviceId, { status: "processing" }),
		onSuccess: async () => {
			toast.success("Work started");
			await refreshData(detail?.store?.id);
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to start work");
		},
	});

	const statusMutation = useMutation({
		mutationFn: (payload: UpdateOrderServiceStatusPayload) =>
			updateOrderServiceStatus(orderId, serviceId, payload),
		onSuccess: async () => {
			toast.success("Status updated");
			setStatusNote("");
			await refreshData(detail?.store?.id);
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to update status");
		},
	});

	const uploadMutation = useMutation({
		mutationFn: async ({ file, note }: { file: File; note?: string }) => {
			const contentType = file.type as
				| "image/jpeg"
				| "image/png"
				| "image/webp"
				| "image/heic";

			if (
				!["image/jpeg", "image/png", "image/webp", "image/heic"].includes(
					contentType,
				)
			) {
				throw new Error("Unsupported image type");
			}

			const presigned = await presignOrderServicePhoto(orderId, serviceId, {
				content_type: contentType,
			});

			await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
			await saveOrderServicePhoto(orderId, serviceId, {
				image_path: presigned.key,
				note,
			});
		},
		onSuccess: async () => {
			toast.success("Photo uploaded");
			setSelectedPhotoFile(null);
			setPhotoNote("");
			await refreshData(detail?.store?.id);
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to upload photo");
		},
	});

	if (detailQuery.isPending) {
		return <QueueServiceDetailSkeleton />;
	}

	if (detailQuery.isError) {
		return (
			<QueueServiceDetailMessage
				tone="error"
				title="Failed to load queue item"
				description={
					detailQuery.error instanceof Error
						? detailQuery.error.message
						: "Please try again in a moment."
				}
			/>
		);
	}

	if (!(detail && selectedService)) {
		return (
			<QueueServiceDetailMessage
				tone="muted"
				title="Queue item not found"
				description="It may have been removed or reassigned."
			/>
		);
	}

	const isHandledByCurrentUser = selectedService.handler_id === currentUser?.id;
	const isHandledByAnotherWorker =
		selectedService.handler_id !== null &&
		selectedService.handler_id !== undefined &&
		!isHandledByCurrentUser;
	const nextStatuses = ORDER_STATUS_TRANSITIONS[selectedService.status] ?? [];
	const canStartWork = selectedService.status === "queued";
	const actionStatuses = nextStatuses.filter(
		(status) =>
			!WORKER_BLOCKED_QUEUE_STATUSES.has(status) &&
			(!canStartWork || status !== "processing"),
	);

	return (
		<>
			<div className="mb-6 flex items-center gap-3">
				<Link
					to="/worker"
					search={{ storeId: queueStoreId ?? detail.store?.id }}
					className="flex size-9 shrink-0 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<ArrowLeftIcon className="size-4" weight="bold" />
				</Link>
				<h1 className="text-2xl font-bold tracking-tight">
					{selectedService.item_code ?? `Queue Item #${selectedService.id}`}
				</h1>
			</div>

			<div className="grid gap-5">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
					<Link
						to="/orders/$orderId"
						params={{ orderId: String(orderId) }}
						className="underline underline-offset-2 hover:text-foreground"
					>
						{detail.code}
					</Link>
					<span>{detail.store?.code ?? "-"}</span>
					<span>{detail.customer?.name ?? "-"}</span>
					{detail.customer?.phone_number ? (
						<a
							href={`tel:${detail.customer.phone_number}`}
							className="underline underline-offset-2 hover:text-foreground"
						>
							{detail.customer.phone_number}
						</a>
					) : null}
					<span>
						{new Date(detail.created_at).toLocaleString("en-ID", {
							dateStyle: "medium",
							timeStyle: "short",
						})}
					</span>
				</div>

				<section className="grid gap-4 border border-border bg-background/70 p-4">
					<div className="flex flex-wrap items-center gap-2">
						{selectedService.is_priority ? (
							<Badge variant="warning">Priority</Badge>
						) : (
							<Badge variant="outline">Standard</Badge>
						)}
						<Badge
							variant={getOrderServiceStatusBadgeVariant(
								selectedService.status,
							)}
						>
							{formatOrderServiceStatus(selectedService.status)}
						</Badge>
						<Badge variant={isHandledByCurrentUser ? "info" : "secondary"}>
							{isHandledByCurrentUser
								? "Assigned to me"
								: isHandledByAnotherWorker
									? `Assigned to ${selectedService.handler?.name ?? "worker"}`
									: "Open"}
						</Badge>
					</div>

					<div className="grid gap-1">
						<p className="text-2xl font-semibold tracking-tight">
							{selectedService.service?.name ?? "Service"}
						</p>
						<p className="text-sm text-muted-foreground">
							{`Item ${formatOrderServiceItemDetails(selectedService)}`}
						</p>
					</div>

					{selectedService.status === "ready_for_pickup" ? (
						<div className="flex items-start gap-2 border border-muted bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
							<WarningCircleIcon
								className="mt-0.5 size-4 shrink-0"
								weight="fill"
							/>
							<p>Waiting for cashier to complete pickup at the counter.</p>
						</div>
					) : null}
				</section>

				<Dialog
					open={isCameraOpen}
					onOpenChange={(open) => {
						if (!open) {
							stopCameraStream();
						}
					}}
				>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle className="flex items-center justify-between">
								<span>Camera</span>
								<Badge variant="outline">Live</Badge>
							</DialogTitle>
						</DialogHeader>

						<video
							ref={cameraPreviewRef}
							autoPlay
							muted
							playsInline
							className="aspect-[4/3] w-full border border-border bg-black object-cover"
						/>

						{cameraError ? (
							<div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
								<WarningCircleIcon
									className="mt-0.5 size-4 shrink-0"
									weight="fill"
								/>
								<span>{cameraError}</span>
							</div>
						) : null}

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={stopCameraStream}
							>
								Cancel
							</Button>
							<Button
								type="button"
								onClick={async () => {
									await captureCameraPhoto();
								}}
							>
								Capture
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<section className="grid gap-4 border border-border bg-background">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 lg:px-5">
						<div className="grid gap-1">
							<p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
								Photos
							</p>
						</div>

						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={async () => {
									await openCamera();
								}}
							>
								<CameraIcon className="size-4" />
							</Button>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={() => openGalleryInput(galleryInputRef.current)}
							>
								<ImageSquareIcon className="size-4" />
							</Button>
						</div>
					</div>

					<div className="grid gap-4 px-4 pb-4 lg:px-5 lg:pb-5">
						<input
							ref={galleryInputRef}
							type="file"
							accept="image/*"
							capture="environment"
							className="sr-only"
							onChange={(event) =>
								setSelectedPhotoFile(event.target.files?.[0] ?? null)
							}
						/>

						{selectedPhotoPreviewUrl ? (
							<div className="grid gap-3">
								<p className="text-sm font-semibold uppercase tracking-[0.16em]">
									Upload preview
								</p>

								<img
									src={selectedPhotoPreviewUrl}
									alt="Selected upload preview"
									width={960}
									height={768}
									className="aspect-[4/3] w-full border border-border object-cover"
									loading="lazy"
								/>

								<textarea
									value={photoNote}
									onChange={(event) => setPhotoNote(event.target.value)}
									placeholder="Optional note (e.g. outsole cracked, midsole separated at heel)"
									rows={2}
									maxLength={200}
									className="w-full resize-none border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
									aria-label="Photo note"
								/>

								<div className="flex gap-2">
									<Button
										type="button"
										className="flex-1"
										loading={uploadMutation.isPending}
										loadingText="Uploading…"
										onClick={async () => {
											if (!selectedPhotoFile) {
												return;
											}

											await uploadMutation.mutateAsync({
												file: selectedPhotoFile,
												note: photoNote.trim() || undefined,
											});
										}}
									>
										Upload
									</Button>
									<Button
										type="button"
										variant="outline"
										disabled={uploadMutation.isPending}
										onClick={() => {
											setSelectedPhotoFile(null);
											setPhotoNote("");
										}}
									>
										Clear
									</Button>
								</div>
							</div>
						) : null}

						<OrderPhotoGallery
							items={selectedService.images.map((image) => ({
								...image,
								alt:
									image.note ??
									`Photo for ${selectedService.item_code ?? `service-${selectedService.id}`}`,
							}))}
							gridClassName="grid-cols-2 xl:grid-cols-3"
							thumbnailClassName="bg-background"
							thumbnailImageClassName="aspect-[5/4]"
							title={`Photos for ${selectedService.item_code ?? `service-${selectedService.id}`}`}
							emptyState={
								<p className="col-span-full border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
									No photos.
								</p>
							}
						/>
					</div>
				</section>

				<section className="grid gap-4 border border-border p-4">
					<StatusTimeline logs={selectedService.statusLogs} />
					<Field>
						<FieldLabel htmlFor="queue-status-note">Status note</FieldLabel>
						<Textarea
							id="queue-status-note"
							placeholder="Optional status note"
							value={statusNote}
							onChange={(event) => setStatusNote(event.target.value)}
						/>
					</Field>
				</section>
			</div>

			<div className="h-20 sm:hidden" />
			<div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur sm:sticky sm:bottom-0 sm:mt-6 sm:px-0 sm:pb-3">
				<div className="flex flex-col gap-2 sm:flex-row">
					{canStartWork ? (
						<HoldToConfirmButton
							className="h-12 sm:flex-1"
							disabled={isHandledByAnotherWorker}
							loading={startWorkMutation.isPending}
							onComplete={async () => {
								await startWorkMutation.mutateAsync();
							}}
						>
							Hold 1s to Start Work
						</HoldToConfirmButton>
					) : null}

					{actionStatuses.map((nextStatus) => (
						<Button
							key={nextStatus}
							type="button"
							variant="secondary"
							size="lg"
							className={cn("h-12 sm:flex-1", canStartWork && "sm:flex-none")}
							disabled={statusMutation.isPending}
							onClick={async () => {
								await statusMutation.mutateAsync({
									status: nextStatus,
									note: statusNote.trim() || undefined,
								});
							}}
						>
							{`Set ${formatOrderServiceStatus(nextStatus)}`}
						</Button>
					))}
				</div>
			</div>
		</>
	);
}
