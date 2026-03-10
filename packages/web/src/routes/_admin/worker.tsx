import { Camera, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	claimOrderService,
	lookupOrderServiceByItemCode,
	presignOrderServicePhoto,
	queryKeys,
	type SaveOrderServicePhotoPayload,
	saveOrderServicePhoto,
	type UpdateOrderServiceStatusPayload,
	updateOrderServiceStatus,
	uploadFileToPresignedUrl,
} from "@/lib/api";
import {
	currentUserDetailQueryOptions,
	myOrderServicesQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { getCurrentUser } from "@/stores/auth-store";

const workerSearchSchema = z.object({
	storeId: z.coerce.number().int().positive().optional(),
});

export const Route = createFileRoute("/_admin/worker")({
	validateSearch: (search) => workerSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const currentUser = getCurrentUser();
		await context.queryClient.ensureQueryData(storesQueryOptions());

		if (currentUser) {
			await context.queryClient.ensureQueryData(
				currentUserDetailQueryOptions(currentUser.id),
			);
		}

		if (currentUser?.role === "admin" || deps.storeId !== undefined) {
			await context.queryClient.ensureQueryData(
				myOrderServicesQueryOptions(deps.storeId),
			);
		}
	},
	component: WorkerPage,
});

const STATUS_OPTIONS: UpdateOrderServiceStatusPayload["status"][] = [
	"received",
	"queued",
	"processing",
	"quality_check",
	"ready_for_pickup",
	"picked_up",
	"refunded",
	"cancelled",
];

type BarcodeDetectorLike = {
	detect: (input: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type WindowWithBarcodeDetector = typeof window & {
	BarcodeDetector?: new (...args: unknown[]) => BarcodeDetectorLike;
};

function WorkerPage() {
	const currentUser = getCurrentUser();
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const queryClient = useQueryClient();

	const [itemCode, setItemCode] = useState("");
	const [selectedItemCode, setSelectedItemCode] = useState("");
	const [selectedStatus, setSelectedStatus] =
		useState<UpdateOrderServiceStatusPayload["status"]>("received");
	const [note, setNote] = useState("");
	const [photoType, setPhotoType] =
		useState<SaveOrderServicePhotoPayload["photo_type"]>("progress");
	const [photoFile, setPhotoFile] = useState<File | null>(null);
	const [isScanning, setIsScanning] = useState(false);
	const [scanError, setScanError] = useState<string | null>(null);

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const rafRef = useRef<number | null>(null);
	const scanningRef = useRef(false);

	const storesQuery = useQuery(storesQueryOptions());

	const currentUserDetailQuery = useQuery({
		...currentUserDetailQueryOptions(currentUser?.id ?? -1),
		enabled: !!currentUser,
	});

	const userStoreIds = useMemo(
		() =>
			currentUserDetailQuery.data?.userStores.map((item) => item.store_id) ??
			[],
		[currentUserDetailQuery.data],
	);

	useEffect(() => {
		if (search.storeId !== undefined || !currentUser) {
			return;
		}

		if (currentUser.role === "admin") {
			return;
		}

		if (userStoreIds.length > 0) {
			void navigate({
				search: (prev) => ({
					...prev,
					storeId: userStoreIds[0],
				}),
				replace: true,
			});
		}
	}, [currentUser, navigate, search.storeId, userStoreIds]);

	const parsedStoreId = search.storeId;

	const myJobsQuery = useQuery({
		...myOrderServicesQueryOptions(parsedStoreId),
		enabled: currentUser?.role === "admin" ? true : parsedStoreId !== undefined,
	});

	const lookupMutation = useMutation({
		mutationFn: lookupOrderServiceByItemCode,
		onSuccess: (data) => {
			setSelectedItemCode(data.item_code ?? "");
			setSelectedStatus(data.status);
			toast.success("Shoe item loaded");
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to find item code");
		},
	});

	const claimMutation = useMutation({
		mutationFn: ({
			orderId,
			serviceId,
		}: {
			orderId: number;
			serviceId: number;
		}) => claimOrderService(orderId, serviceId),
		onSuccess: async () => {
			toast.success("Claimed successfully");
			await queryClient.invalidateQueries({
				queryKey: queryKeys.orderServiceLookup(selectedItemCode),
			});
			await queryClient.invalidateQueries({
				queryKey: queryKeys.myOrderServices(parsedStoreId),
			});
			if (selectedItemCode) {
				await lookupMutation.mutateAsync(selectedItemCode);
			}
		},
	});

	const statusMutation = useMutation({
		mutationFn: ({
			orderId,
			serviceId,
			payload,
		}: {
			orderId: number;
			serviceId: number;
			payload: UpdateOrderServiceStatusPayload;
		}) => updateOrderServiceStatus(orderId, serviceId, payload),
		onSuccess: async () => {
			toast.success("Status updated");
			await queryClient.invalidateQueries({
				queryKey: queryKeys.myOrderServices(parsedStoreId),
			});
			if (selectedItemCode) {
				await lookupMutation.mutateAsync(selectedItemCode);
			}
		},
	});

	const uploadMutation = useMutation({
		mutationFn: async ({
			orderId,
			serviceId,
			file,
			photoType: targetType,
		}: {
			orderId: number;
			serviceId: number;
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
				photo_type: targetType,
			});

			await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
			await saveOrderServicePhoto(orderId, serviceId, {
				photo_type: targetType,
				s3_key: presigned.key,
			});
		},
		onSuccess: async () => {
			toast.success("Photo uploaded");
			setPhotoFile(null);
			await queryClient.invalidateQueries({
				queryKey: queryKeys.myOrderServices(parsedStoreId),
			});
			if (selectedItemCode) {
				await lookupMutation.mutateAsync(selectedItemCode);
			}
		},
		onError: (error: Error) => {
			toast.error(error.message || "Upload failed");
		},
	});

	const selectedService = lookupMutation.data;

	const stopScanner = () => {
		scanningRef.current = false;
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}

		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) {
				track.stop();
			}
			streamRef.current = null;
		}

		setIsScanning(false);
	};

	useEffect(() => {
		return () => {
			scanningRef.current = false;
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}

			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) {
					track.stop();
				}
				streamRef.current = null;
			}
		};
	}, []);

	const startScanner = async () => {
		setScanError(null);
		const w = window as WindowWithBarcodeDetector;

		if (!w.BarcodeDetector) {
			setScanError("Barcode scanner is not supported on this browser.");
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
			});
			streamRef.current = stream;
			setIsScanning(true);
			scanningRef.current = true;

			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}

			const detector = new w.BarcodeDetector();
			const detect = async () => {
				if (!videoRef.current || !scanningRef.current) {
					return;
				}

				try {
					const codes = await detector.detect(videoRef.current);
					const rawValue = codes.find((item) => !!item.rawValue)?.rawValue;

					if (rawValue) {
						setItemCode(rawValue);
						setSelectedItemCode(rawValue);
						stopScanner();
						await lookupMutation.mutateAsync(rawValue);
						return;
					}
				} catch {
					// ignore frame-level errors
				}

				rafRef.current = requestAnimationFrame(() => {
					void detect();
				});
			};

			rafRef.current = requestAnimationFrame(() => {
				void detect();
			});
		} catch {
			setScanError("Unable to access camera.");
			stopScanner();
		}
	};

	return (
		<>
			<PageHeader
				title="Worker Ops"
				description="Lookup item tags, claim work, update status, and upload photos."
			/>
			<div className="grid gap-4 md:max-w-xl">
				<Card>
					<CardContent className="grid gap-3 pt-6">
						{currentUser?.role !== "admin" ? (
							<p className="text-xs text-muted-foreground">
								This page only shows stores assigned to your account.
							</p>
						) : null}

						<Field>
							<FieldLabel htmlFor="worker-store">Store</FieldLabel>
							<Select
								value={search.storeId?.toString() ?? ""}
								onValueChange={(value) => {
									void navigate({
										search: (prev) => ({
											...prev,
											storeId: value ? Number(value) : undefined,
										}),
									});
								}}
							>
								<SelectTrigger id="worker-store" className="h-10 w-full">
									<SelectValue placeholder="Select store" />
								</SelectTrigger>
								<SelectContent>
									{storesQuery.data
										?.filter((store) =>
											currentUser?.role === "admin"
												? true
												: userStoreIds.includes(store.id),
										)
										.map((store) => (
											<SelectItem key={store.id} value={String(store.id)}>
												{`${store.code} - ${store.name}`}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</Field>

						<div className="flex gap-2">
							<Input
								placeholder="Scan or type item code"
								value={itemCode}
								onChange={(event) => setItemCode(event.target.value)}
							/>
							<Button
								variant="outline"
								onClick={async () => {
									if (!itemCode.trim()) {
										return;
									}
									setSelectedItemCode(itemCode.trim());
									await lookupMutation.mutateAsync(itemCode.trim());
								}}
								icon={<MagnifyingGlass className="size-4" weight="duotone" />}
							>
								Find
							</Button>
						</div>

						<div className="flex gap-2">
							{isScanning ? (
								<Button variant="outline" onClick={stopScanner}>
									Stop Camera
								</Button>
							) : (
								<Button
									variant="outline"
									onClick={async () => {
										await startScanner();
									}}
									icon={<Camera className="size-4" weight="duotone" />}
								>
									Scan Tag
								</Button>
							)}
							{scanError ? <Badge variant="danger">{scanError}</Badge> : null}
						</div>

						{isScanning ? (
							<video
								ref={videoRef}
								className="h-56 w-full rounded-none border object-cover"
								autoPlay
								playsInline
								muted
							/>
						) : null}
					</CardContent>
				</Card>

				{selectedService ? (
					<Card>
						<CardHeader>
							<CardTitle>
								{selectedService.item_code ?? `Service #${selectedService.id}`}
							</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-3">
							<p>{`Order: ${selectedService.order?.code ?? "-"}`}</p>
							<p>{`Service: ${selectedService.service?.name ?? "-"}`}</p>
							<p>{`Item: ${selectedService.color ?? "-"} / ${selectedService.shoe_brand ?? "-"} / ${selectedService.shoe_size ?? "-"}`}</p>
							<p>{`Status: ${selectedService.status}`}</p>
							<p>{`Handler: ${selectedService.handler?.name ?? "Not assigned"}`}</p>

							<div className="flex gap-2">
								<Button
									variant="outline"
									disabled={claimMutation.isPending || !selectedService.order}
									onClick={async () => {
										if (!selectedService.order) {
											return;
										}
										await claimMutation.mutateAsync({
											orderId: selectedService.order.id,
											serviceId: selectedService.id,
										});
									}}
								>
									Handled by me
								</Button>
							</div>

							<Field>
								<FieldLabel htmlFor="worker-status">Status</FieldLabel>
								<Select
									value={selectedStatus}
									onValueChange={(value) =>
										setSelectedStatus(
											(value ??
												"received") as UpdateOrderServiceStatusPayload["status"],
										)
									}
								>
									<SelectTrigger id="worker-status" className="h-10 w-full">
										<SelectValue placeholder="Select status" />
									</SelectTrigger>
									<SelectContent>
										{STATUS_OPTIONS.map((status) => (
											<SelectItem key={status} value={status}>
												{status}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Input
								placeholder="Optional status note"
								value={note}
								onChange={(event) => setNote(event.target.value)}
							/>

							<Button
								disabled={statusMutation.isPending || !selectedService.order}
								onClick={async () => {
									if (!selectedService.order) {
										return;
									}
									await statusMutation.mutateAsync({
										orderId: selectedService.order.id,
										serviceId: selectedService.id,
										payload: {
											status: selectedStatus,
											note: note.trim() || undefined,
										},
									});
								}}
							>
								Update status
							</Button>

							<Field>
								<FieldLabel htmlFor="worker-photo-type">Photo Type</FieldLabel>
								<Select
									value={photoType}
									onValueChange={(value) =>
										setPhotoType(
											(value ??
												"progress") as SaveOrderServicePhotoPayload["photo_type"],
										)
									}
								>
									<SelectTrigger id="worker-photo-type" className="h-10 w-full">
										<SelectValue placeholder="Select photo type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="dropoff">dropoff</SelectItem>
										<SelectItem value="progress">progress</SelectItem>
										<SelectItem value="pickup">pickup</SelectItem>
										<SelectItem value="refund">refund</SelectItem>
									</SelectContent>
								</Select>
							</Field>

							<input
								type="file"
								accept="image/jpeg,image/png,image/webp,image/heic"
								onChange={(event) =>
									setPhotoFile(event.target.files?.[0] ?? null)
								}
							/>

							<Button
								variant="outline"
								disabled={
									uploadMutation.isPending ||
									!photoFile ||
									!selectedService.order
								}
								onClick={async () => {
									if (!(photoFile && selectedService.order)) {
										return;
									}

									await uploadMutation.mutateAsync({
										orderId: selectedService.order.id,
										serviceId: selectedService.id,
										file: photoFile,
										photoType,
									});
								}}
							>
								Upload photo
							</Button>
						</CardContent>
					</Card>
				) : null}

				<Card>
					<CardHeader>
						<CardTitle>My Jobs</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-2">
						{myJobsQuery.isPending ? (
							<p className="text-sm text-muted-foreground">Loading jobs...</p>
						) : myJobsQuery.data?.length ? (
							myJobsQuery.data.map((job) => (
								<button
									type="button"
									key={job.id}
									className="grid gap-1 rounded-none border p-3 text-left"
									onClick={async () => {
										if (!job.item_code) {
											return;
										}
										setItemCode(job.item_code);
										setSelectedItemCode(job.item_code);
										await lookupMutation.mutateAsync(job.item_code);
									}}
								>
									<div className="flex items-center justify-between gap-2">
										<p className="font-medium">
											{job.item_code ?? `#${job.id}`}
										</p>
										<Badge
											variant={getOrderServiceStatusBadgeVariant(job.status)}
										>
											{formatOrderServiceStatus(job.status)}
										</Badge>
									</div>
									<p className="text-xs text-muted-foreground">
										{job.service_name}
									</p>
									<p className="text-xs text-muted-foreground">
										{job.color ?? "-"} / {job.shoe_brand ?? "-"} /{" "}
										{job.shoe_size ?? "-"}
									</p>
								</button>
							))
						) : (
							<p className="text-sm text-muted-foreground">No assigned jobs.</p>
						)}
					</CardContent>
				</Card>

				{selectedItemCode ? (
					<Button
						variant="outline"
						onClick={() => {
							setSelectedItemCode("");
							setItemCode("");
							setNote("");
							setPhotoFile(null);
							lookupMutation.reset();
						}}
						icon={<X className="size-4" weight="duotone" />}
					>
						Clear selected item
					</Button>
				) : null}
			</div>
		</>
	);
}
