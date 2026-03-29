import {
	ArrowLeftIcon,
	CameraIcon,
	ImageSquareIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HoldToConfirmButton } from "@/features/orders/components/hold-to-confirm-button";
import { OrderPhotoGallery } from "@/features/orders/components/order-photo-gallery";
import {
	type OrderDetail,
	presignOrderServicePhoto,
	queryKeys,
	type SaveOrderServicePhotoPayload,
	saveOrderServicePhoto,
	startOrderServiceWork,
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

const ORDER_STATUS_TRANSITIONS: Record<
	UpdateOrderServiceStatusPayload["status"],
	UpdateOrderServiceStatusPayload["status"][]
> = {
	received: ["queued", "cancelled"],
	queued: ["processing", "cancelled"],
	processing: ["quality_check", "cancelled"],
	quality_check: ["processing", "ready_for_pickup", "cancelled"],
	ready_for_pickup: ["picked_up", "refunded", "cancelled"],
	picked_up: [],
	refunded: [],
	cancelled: [],
};

const WORKER_BLOCKED_QUEUE_STATUSES = new Set<
	UpdateOrderServiceStatusPayload["status"]
>(["cancelled", "refunded"]);

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
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const currentUser = getCurrentUser();
	const galleryInputRef = useRef<HTMLInputElement | null>(null);
	const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
	const cameraStreamRef = useRef<MediaStream | null>(null);

	const [statusNote, setStatusNote] = useState("");
	const [selectedPhotoType, setSelectedPhotoType] =
		useState<SaveOrderServicePhotoPayload["photo_type"]>("progress");
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
		if (!selectedService) {
			return;
		}

		setSelectedPhotoType(getRecommendedPhotoType(selectedService));
	}, [selectedService]);

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
		mutationFn: () => startOrderServiceWork(orderId, serviceId),
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
		mutationFn: async ({
			file,
			photoType,
		}: {
			file: File;
			photoType: SaveOrderServicePhotoPayload["photo_type"];
		}) => {
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
				photo_type: photoType,
			});

			await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
			await saveOrderServicePhoto(orderId, serviceId, {
				photo_type: photoType,
				s3_key: presigned.key,
			});
		},
		onSuccess: async () => {
			toast.success("Photo uploaded");
			setSelectedPhotoFile(null);
			await refreshData(detail?.store?.id);
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to upload photo");
		},
	});

	if (detailQuery.isPending) {
		return <p>Loading queue item...</p>;
	}

	if (detailQuery.isError) {
		return (
			<p>
				{detailQuery.error instanceof Error
					? detailQuery.error.message
					: "Failed to load queue item."}
			</p>
		);
	}

	if (!(detail && selectedService)) {
		return <p>Queue item not found.</p>;
	}

	const isHandledByCurrentUser = selectedService.handler_id === currentUser?.id;
	const isHandledByAnotherWorker =
		selectedService.handler_id !== null &&
		selectedService.handler_id !== undefined &&
		!isHandledByCurrentUser;
	const hasPickupPhoto = selectedService.images.some(
		(image) => image.photo_type === "pickup",
	);
	const nextStatuses = ORDER_STATUS_TRANSITIONS[selectedService.status] ?? [];
	const canStartWork = ["received", "queued"].includes(selectedService.status);
	const actionStatuses = nextStatuses.filter(
		(status) =>
			!WORKER_BLOCKED_QUEUE_STATUSES.has(status) &&
			(!canStartWork || status !== "processing"),
	);

	return (
		<>
			<PageHeader
				title={selectedService.item_code ?? `Queue Item #${selectedService.id}`}
				actions={
					<Button
						type="button"
						variant="outline"
						icon={<ArrowLeftIcon className="size-4" weight="duotone" />}
						onClick={() => {
							void navigate({
								to: "/worker",
								search: { storeId: queueStoreId ?? detail.store?.id },
							});
						}}
					>
						Back to Queue
					</Button>
				}
			/>

			<div className="grid gap-5">
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

					<div className="grid gap-4 md:grid-cols-2">
						<div className="grid gap-2">
							<p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
								Service
							</p>
							<p className="text-2xl font-semibold tracking-tight">
								{selectedService.service?.name ?? "Service"}
							</p>
							<p className="text-sm text-muted-foreground">
								{`Item ${formatOrderServiceItemDetails(selectedService)}`}
							</p>
						</div>

						<div className="grid gap-2 text-sm text-muted-foreground">
							<p>{`Order ${detail.code}`}</p>
							<p>{`Store ${detail.store?.code ?? "-"} - ${detail.store?.name ?? "-"}`}</p>
							<p>
								{new Date(detail.created_at).toLocaleString("en-ID", {
									dateStyle: "medium",
									timeStyle: "short",
								})}
							</p>
							<p>{`Customer ${detail.customer?.name ?? "-"}`}</p>
						</div>
					</div>

					{selectedService.status === "ready_for_pickup" && !hasPickupPhoto ? (
						<div className="flex items-start gap-2 border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-foreground">
							<WarningCircleIcon
								className="mt-0.5 size-4 shrink-0"
								weight="fill"
							/>
							<p>Add a pickup photo before marking this item as picked up.</p>
						</div>
					) : null}
				</section>

				<section className="grid gap-4 border border-border p-4">
					<div className="flex items-center justify-between gap-3">
						<div className="grid gap-1">
							<p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
								Photos
							</p>
							<p className="text-sm text-muted-foreground">
								Camera and gallery are equally available for fast upload.
							</p>
						</div>
						<Select
							value={selectedPhotoType}
							onValueChange={(value) =>
								setSelectedPhotoType(
									(value ??
										"progress") as SaveOrderServicePhotoPayload["photo_type"],
								)
							}
						>
							<SelectTrigger className="h-11 w-40">
								<SelectValue placeholder="Photo type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="dropoff">dropoff</SelectItem>
								<SelectItem value="progress">progress</SelectItem>
								<SelectItem value="pickup">pickup</SelectItem>
								<SelectItem value="refund">refund</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,420px)] lg:items-start">
						<div className="grid gap-3">
							<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
								<Button
									type="button"
									variant="outline"
									className="h-12 justify-start"
									icon={<CameraIcon className="size-4" weight="duotone" />}
									onClick={async () => {
										if (isCameraOpen) {
											stopCameraStream();
											return;
										}

										await openCamera();
									}}
								>
									{isCameraOpen ? "Close Camera" : "Camera"}
								</Button>
								<Button
									type="button"
									variant="outline"
									className="h-12 justify-start"
									icon={<ImageSquareIcon className="size-4" weight="duotone" />}
									onClick={() => openGalleryInput(galleryInputRef.current)}
								>
									Gallery
								</Button>
							</div>

							{cameraError ? (
								<div className="flex items-center gap-2 text-sm text-destructive">
									<WarningCircleIcon className="size-4" weight="fill" />
									<span>{cameraError}</span>
								</div>
							) : null}
						</div>

						<div className="grid gap-4 lg:max-w-md">
							{isCameraOpen ? (
								<div className="grid gap-3 border border-border p-3">
									<video
										ref={cameraPreviewRef}
										autoPlay
										muted
										playsInline
										className="aspect-4/3 w-full max-w-md border border-border object-cover"
									/>
									<div className="flex flex-col gap-2 sm:flex-row">
										<Button
											type="button"
											className="sm:flex-1"
											onClick={async () => {
												await captureCameraPhoto();
											}}
										>
											Capture photo
										</Button>
										<Button
											type="button"
											variant="outline"
											className="sm:flex-1"
											onClick={stopCameraStream}
										>
											Cancel camera
										</Button>
									</div>
								</div>
							) : null}

							<input
								ref={galleryInputRef}
								type="file"
								accept="image/*"
								className="sr-only"
								onChange={(event) =>
									setSelectedPhotoFile(event.target.files?.[0] ?? null)
								}
							/>

							{selectedPhotoPreviewUrl ? (
								<div className="grid gap-2 border border-border p-3">
									<img
										src={selectedPhotoPreviewUrl}
										alt="Selected upload preview"
										width={960}
										height={768}
										className="aspect-4/3 w-full max-w-md object-cover"
									/>
									<div className="flex flex-col gap-2 sm:flex-row">
										<Button
											type="button"
											className="sm:flex-1"
											loading={uploadMutation.isPending}
											loadingText="Uploading…"
											onClick={async () => {
												if (!selectedPhotoFile) {
													return;
												}

												await uploadMutation.mutateAsync({
													file: selectedPhotoFile,
													photoType: selectedPhotoType,
												});
											}}
										>
											Upload photo
										</Button>
										<Button
											type="button"
											variant="outline"
											className="sm:flex-1"
											disabled={uploadMutation.isPending}
											onClick={() => setSelectedPhotoFile(null)}
										>
											Clear
										</Button>
									</div>
								</div>
							) : null}
						</div>
					</div>

					<OrderPhotoGallery
						items={selectedService.images.map((image) => ({
							...image,
							alt: `${image.photo_type} for ${selectedService.item_code ?? `service-${selectedService.id}`}`,
						}))}
						gridClassName="sm:grid-cols-2 xl:grid-cols-3"
						thumbnailImageClassName="aspect-[5/4]"
						title={`Photos for ${selectedService.item_code ?? `service-${selectedService.id}`}`}
						emptyState={
							<p className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground sm:col-span-2">
								No photos uploaded yet.
							</p>
						}
					/>
				</section>

				<section className="grid gap-4 border border-border p-4">
					<div className="grid gap-1">
						<p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
							Updates
						</p>
						<p className="text-sm text-muted-foreground">
							Add an optional note before pushing the next status.
						</p>
					</div>

					<Field>
						<FieldLabel htmlFor="queue-status-note">Status note</FieldLabel>
						<Textarea
							id="queue-status-note"
							placeholder="Optional status note"
							value={statusNote}
							onChange={(event) => setStatusNote(event.target.value)}
						/>
					</Field>

					<div className="grid gap-2">
						{selectedService.statusLogs.length > 0 ? (
							selectedService.statusLogs.map((log) => (
								<div
									key={log.id}
									className="grid gap-1 border-l border-border pl-3 text-sm"
								>
									<p className="font-medium">
										{formatOrderServiceStatus(log.to_status)}
									</p>
									<p className="text-muted-foreground">
										{`${log.changedBy?.name ?? "-"} • ${new Date(log.created_at).toLocaleString()}`}
									</p>
									{log.note ? (
										<p className="text-muted-foreground">{log.note}</p>
									) : null}
								</div>
							))
						) : (
							<p className="text-sm text-muted-foreground">
								No status updates yet.
							</p>
						)}
					</div>
				</section>
			</div>

			<div className="sticky bottom-0 z-10 mt-6 border-t border-border bg-background/95 px-0 py-3 backdrop-blur">
				<div className="flex flex-col gap-2 sm:flex-row">
					{canStartWork ? (
						<HoldToConfirmButton
							className="h-12 flex-1"
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
							className={cn("h-12 flex-1", canStartWork && "sm:flex-none")}
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

function getRecommendedPhotoType(
	service: NonNullable<OrderDetail["services"]>[number],
): SaveOrderServicePhotoPayload["photo_type"] {
	const hasPickupPhoto = service.images.some(
		(image) => image.photo_type === "pickup",
	);

	if (service.status === "ready_for_pickup" && !hasPickupPhoto) {
		return "pickup";
	}

	return "progress";
}
