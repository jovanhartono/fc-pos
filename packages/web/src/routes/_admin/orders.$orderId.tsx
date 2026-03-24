import {
	type UseMutationResult,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OrderFulfillmentOverview } from "@/features/orders/components/order-fulfillment-overview";
import { OrderIntakePhotoCard } from "@/features/orders/components/order-intake-photo-card";
import { QueueServiceDetail } from "@/features/orders/components/queue-service-detail";
import {
	claimOrderService,
	completeOrderPickup,
	createOrderRefund,
	presignOrderServicePhoto,
	queryKeys,
	type SaveOrderServicePhotoPayload,
	saveOrderServicePhoto,
	type UpdateOrderServiceStatusPayload,
	updateOrderPayment,
	updateOrderServiceStatus,
	uploadFileToPresignedUrl,
} from "@/lib/api";
import {
	orderDetailQueryOptions,
	paymentMethodsQueryOptions,
} from "@/lib/query-options";
import {
	formatOrderPickupState,
	formatOrderServiceStatus,
	formatOrderStatus,
	formatPaymentStatus,
	getOrderPickupStateBadgeVariant,
	getOrderServiceStatusBadgeVariant,
	getOrderStatusBadgeVariant,
	getPaymentStatusBadgeVariant,
} from "@/lib/status";
import { formatIDRCurrency } from "@/shared/utils";
import { getCurrentUser } from "@/stores/auth-store";
import { useDialog } from "@/stores/dialog-store";

const orderDetailSearchSchema = z.object({
	queueStoreId: z.coerce.number().int().positive().optional(),
	workerServiceId: z.coerce.number().int().positive().optional(),
});

export const Route = createFileRoute("/_admin/orders/$orderId")({
	validateSearch: (search) => orderDetailSearchSchema.parse(search),
	loader: async ({ context, params }) => {
		const id = Number(params.orderId);

		if (!Number.isInteger(id) || id <= 0) {
			return;
		}

		await Promise.all([
			context.queryClient.ensureQueryData(orderDetailQueryOptions(id)),
			context.queryClient.ensureQueryData(paymentMethodsQueryOptions()),
		]);
	},
	component: OrderDetailPage,
});

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

const STATUS_ACTION_LABELS: Record<
	UpdateOrderServiceStatusPayload["status"],
	string
> = {
	received: "Receive",
	queued: "Queue",
	processing: "Process",
	quality_check: "Quality Check",
	ready_for_pickup: "Ready for Pickup",
	picked_up: "Pick Up",
	refunded: "Refund",
	cancelled: "Cancel",
};

const REFUND_REASONS = ["damaged", "cannot_process", "lost", "other"] as const;

function ServiceStatusUpdateButton({
	serviceId,
	nextStatus,
	isCancel,
	updateStatusMutation,
}: {
	serviceId: number;
	nextStatus: UpdateOrderServiceStatusPayload["status"];
	isCancel: boolean;
	updateStatusMutation: UseMutationResult<
		unknown,
		Error,
		{ serviceId: number; payload: UpdateOrderServiceStatusPayload },
		unknown
	>;
}) {
	const { openDialog, closeDialog } = useDialog();

	const handleClick = () => {
		openDialog({
			title: isCancel
				? "Cancel Service"
				: `Update Status to ${STATUS_ACTION_LABELS[nextStatus]}`,
			description: isCancel
				? "Please provide a reason for cancelling this service."
				: `Are you sure you want to change the status to ${STATUS_ACTION_LABELS[nextStatus]}?`,
			content: (
				<DialogForm
					isCancel={isCancel}
					serviceId={serviceId}
					nextStatus={nextStatus}
					updateStatusMutation={updateStatusMutation}
					closeDialog={closeDialog}
				/>
			),
		});
	};

	return (
		<Button
			variant={isCancel ? "destructive" : "secondary"}
			size="sm"
			onClick={handleClick}
		>
			{STATUS_ACTION_LABELS[nextStatus]}
		</Button>
	);
}

function DialogForm({
	isCancel,
	serviceId,
	nextStatus,
	updateStatusMutation,
	closeDialog,
}: {
	isCancel: boolean;
	serviceId: number;
	nextStatus: UpdateOrderServiceStatusPayload["status"];
	updateStatusMutation: UseMutationResult<
		unknown,
		Error,
		{ serviceId: number; payload: UpdateOrderServiceStatusPayload },
		unknown
	>;
	closeDialog: () => void;
}) {
	const [note, setNote] = useState("");
	return (
		<div className="flex flex-col gap-4">
			<Textarea
				placeholder={
					isCancel ? "Cancel reason (required)" : "Optional status note"
				}
				value={note}
				onChange={(e) => setNote(e.target.value)}
			/>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button variant="outline" onClick={closeDialog}>
					Go back
				</Button>
				<Button
					variant={isCancel ? "destructive" : "default"}
					disabled={
						updateStatusMutation.isPending || (isCancel && !note.trim())
					}
					onClick={async () => {
						await updateStatusMutation.mutateAsync({
							serviceId,
							payload: {
								status: nextStatus,
								note: note.trim() || undefined,
							},
						});
						closeDialog();
					}}
				>
					{isCancel ? "Confirm Cancel" : "Confirm Update"}
				</Button>
			</div>
		</div>
	);
}

function OrderDetailPage() {
	const search = Route.useSearch();
	const { orderId } = Route.useParams();
	const parsedOrderId = Number(orderId);

	if (search.workerServiceId) {
		return (
			<QueueServiceDetail
				orderId={parsedOrderId}
				serviceId={search.workerServiceId}
				queueStoreId={search.queueStoreId}
			/>
		);
	}

	return <AdminOrderDetailPage />;
}

function AdminOrderDetailPage() {
	const user = getCurrentUser();
	const isPaymentAllowed = user?.role === "admin" || user?.role === "cashier";
	const isRefundAllowed = isPaymentAllowed;

	const { orderId } = Route.useParams();
	const id = Number(orderId);
	const isValidOrderId = Number.isInteger(id) && id > 0;
	const queryClient = useQueryClient();

	const [photoTypeByServiceId, setPhotoTypeByServiceId] = useState<
		Record<number, SaveOrderServicePhotoPayload["photo_type"]>
	>({});
	const [photoFileByServiceId, setPhotoFileByServiceId] = useState<
		Record<number, File | null>
	>({});
	const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");

	const [refundServiceIds, setRefundServiceIds] = useState<number[]>([]);
	const [refundReasonByServiceId, setRefundReasonByServiceId] = useState<
		Record<number, (typeof REFUND_REASONS)[number]>
	>({});
	const [refundItemNoteByServiceId, setRefundItemNoteByServiceId] = useState<
		Record<number, string>
	>({});
	const [refundNote, setRefundNote] = useState("");

	const detailQuery = useQuery({
		...orderDetailQueryOptions(id),
		enabled: isValidOrderId,
	});

	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());

	const refreshOrderData = async () => {
		await queryClient.invalidateQueries({
			queryKey: queryKeys.orderDetail(id),
		});
		await queryClient.invalidateQueries({ queryKey: ["orders"] });
	};

	const claimMutation = useMutation({
		mutationFn: ({ serviceId }: { serviceId: number }) =>
			claimOrderService(id, serviceId),
		onSuccess: async () => {
			toast.success("Service claimed");
			await refreshOrderData();
		},
	});

	const updateStatusMutation = useMutation({
		mutationFn: ({
			serviceId,
			payload,
		}: {
			serviceId: number;
			payload: UpdateOrderServiceStatusPayload;
		}) => updateOrderServiceStatus(id, serviceId, payload),
		onSuccess: async () => {
			toast.success("Service status updated");
			await refreshOrderData();
		},
	});

	const paymentMutation = useMutation({
		mutationFn: (paymentMethodId: number) =>
			updateOrderPayment(id, { payment_method_id: paymentMethodId }),
		onSuccess: async () => {
			toast.success("Payment updated");
			await refreshOrderData();
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to update payment");
		},
	});

	const completePickupMutation = useMutation({
		mutationFn: () => completeOrderPickup(id),
		onSuccess: async () => {
			toast.success("Order marked as completed");
			await refreshOrderData();
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to complete pickup");
		},
	});

	const uploadPhotoMutation = useMutation({
		mutationFn: async ({
			serviceId,
			photoType,
			file,
		}: {
			serviceId: number;
			photoType: SaveOrderServicePhotoPayload["photo_type"];
			file: File;
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

			const presigned = await presignOrderServicePhoto(id, serviceId, {
				content_type: contentType,
				photo_type: photoType,
			});
			await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
			await saveOrderServicePhoto(id, serviceId, {
				photo_type: photoType,
				s3_key: presigned.key,
			});
		},
		onSuccess: async (_, variables) => {
			toast.success("Photo uploaded");
			setPhotoFileByServiceId((prev) => ({
				...prev,
				[variables.serviceId]: null,
			}));
			await refreshOrderData();
		},
	});

	const refundMutation = useMutation({
		mutationFn: ({
			orderId: targetOrderId,
			payload,
		}: {
			orderId: number;
			payload: Parameters<typeof createOrderRefund>[1];
		}) => createOrderRefund(targetOrderId, payload),
		onSuccess: async () => {
			toast.success("Refund processed");
			setRefundServiceIds([]);
			setRefundReasonByServiceId({});
			setRefundItemNoteByServiceId({});
			setRefundNote("");
			await refreshOrderData();
		},
	});

	if (!isValidOrderId) {
		return <p>Invalid order ID.</p>;
	}

	if (detailQuery.isPending) {
		return <p>Loading order...</p>;
	}

	if (detailQuery.isError) {
		return (
			<p>
				{detailQuery.error instanceof Error
					? detailQuery.error.message
					: "Failed to load order."}
			</p>
		);
	}

	if (!detailQuery.data) {
		return <p>Order not found.</p>;
	}

	const detail = detailQuery.data;
	const paymentMethods = Array.isArray(paymentMethodsQuery.data)
		? paymentMethodsQuery.data
		: [];
	const orderServices = Array.isArray(detail.services) ? detail.services : [];

	const refundableServices = orderServices.filter(
		(service) =>
			!["picked_up", "refunded", "cancelled"].includes(service.status),
	);

	const selectedRefundItems = refundServiceIds.map((serviceId) => ({
		order_service_id: serviceId,
		reason: refundReasonByServiceId[serviceId] ?? "damaged",
		note: refundItemNoteByServiceId[serviceId]?.trim() || undefined,
	}));

	const refundValidationError = selectedRefundItems.find(
		(item) => item.reason === "other" && !item.note,
	);

	return (
		<>
			<PageHeader
				title={`Order ${detail.code}`}
				description={`Customer: ${detail.customer?.name ?? "-"} • Store: ${detail.store?.name ?? "-"}`}
				actions={
					<>
						<Badge variant={getOrderStatusBadgeVariant(detail.status)}>
							{formatOrderStatus(detail.status)}
						</Badge>
						<Badge
							variant={getOrderPickupStateBadgeVariant(detail.fulfillment)}
						>
							{formatOrderPickupState(detail.fulfillment)}
						</Badge>
						<Badge
							variant={getPaymentStatusBadgeVariant(detail.payment_status)}
						>
							{formatPaymentStatus(detail.payment_status)}
						</Badge>
					</>
				}
			/>

			<div className="mb-6 grid gap-4">
				<OrderFulfillmentOverview
					order={detail}
					canCompletePickup={detail.fulfillment.is_ready_for_pickup}
					isCompleting={completePickupMutation.isPending}
					onCompletePickup={async () => {
						await completePickupMutation.mutateAsync();
					}}
				/>
			</div>

			<div className="mb-6 grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Customer Details
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="font-medium">{detail.customer?.name ?? "-"}</p>
						<p className="text-sm text-muted-foreground">
							{detail.customer?.phone_number ?? "-"}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Order Details
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="font-medium">{detail.store?.name ?? "-"}</p>
						<p className="text-sm text-muted-foreground">
							{new Date(detail.created_at).toLocaleString("en-ID", {
								dateStyle: "medium",
								timeStyle: "short",
							})}
						</p>
						{detail.notes ? (
							<p className="mt-2 border-t pt-2 text-sm text-muted-foreground">
								{detail.notes}
							</p>
						) : null}
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Financial Summary
						</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-2 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Total</span>
							<span>{formatIDRCurrency(String(detail.total ?? 0))}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Discount</span>
							<span>-{formatIDRCurrency(String(detail.discount ?? 0))}</span>
						</div>
						<div className="flex justify-between border-t pt-2 font-medium">
							<span>Net Total</span>
							<span>
								{formatIDRCurrency(
									String(
										Number(detail.total ?? 0) - Number(detail.discount ?? 0),
									),
								)}
							</span>
						</div>
						{Number(detail.refunded_amount) > 0 ? (
							<div className="flex justify-between text-destructive">
								<span>Refunded</span>
								<span>
									-{formatIDRCurrency(String(detail.refunded_amount ?? 0))}
								</span>
							</div>
						) : null}
					</CardContent>
				</Card>
			</div>

			<div className="grid items-start gap-4 lg:grid-cols-12">
				<div className="grid gap-4 lg:col-span-4">
					<OrderIntakePhotoCard
						order={detail}
						canManage={user?.role === "admin" || user?.role === "cashier"}
						onUploaded={refreshOrderData}
					/>

					{isPaymentAllowed && detail.payment_status !== "paid" ? (
						<Card>
							<CardHeader>
								<CardTitle>Payment</CardTitle>
							</CardHeader>
							<CardContent className="grid gap-3">
								<Select
									value={selectedPaymentMethodId}
									onValueChange={(value) =>
										setSelectedPaymentMethodId(value ?? "")
									}
								>
									<SelectTrigger className="h-10 w-full">
										<SelectValue placeholder="Select payment method" />
									</SelectTrigger>
									<SelectContent>
										{paymentMethods.map((method) => (
											<SelectItem key={method.id} value={String(method.id)}>
												{method.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									disabled={
										paymentMutation.isPending || !selectedPaymentMethodId
									}
									onClick={async () => {
										await paymentMutation.mutateAsync(
											Number(selectedPaymentMethodId),
										);
									}}
								>
									Mark as paid
								</Button>
							</CardContent>
						</Card>
					) : null}

					{isRefundAllowed ? (
						<Card>
							<CardHeader>
								<CardTitle>Refund</CardTitle>
							</CardHeader>
							<CardContent className="grid gap-3">
								<div className="flex gap-2">
									<Button
										variant="outline"
										onClick={() =>
											setRefundServiceIds(
												refundableServices.map((service) => service.id),
											)
										}
									>
										Select all refundable
									</Button>
									<Button
										variant="outline"
										onClick={() => setRefundServiceIds([])}
									>
										Clear
									</Button>
								</div>

								{refundableServices.map((service) => {
									const selected = refundServiceIds.includes(service.id);
									const reason =
										refundReasonByServiceId[service.id] ?? "damaged";
									return (
										<div
											key={service.id}
											className="grid gap-2 rounded-none border p-3"
										>
											<label className="flex items-center gap-2 text-sm">
												<input
													type="checkbox"
													checked={selected}
													onChange={(event) => {
														if (event.target.checked) {
															setRefundServiceIds((prev) =>
																prev.includes(service.id)
																	? prev
																	: [...prev, service.id],
															);
															return;
														}
														setRefundServiceIds((prev) =>
															prev.filter((id) => id !== service.id),
														);
													}}
												/>
												<span>
													{service.item_code ?? `Service #${service.id}`}
												</span>
											</label>

											<Select
												value={reason}
												onValueChange={(value) =>
													setRefundReasonByServiceId((prev) => ({
														...prev,
														[service.id]: (value ??
															"damaged") as (typeof REFUND_REASONS)[number],
													}))
												}
												disabled={!selected}
											>
												<SelectTrigger className="h-10 w-full">
													<SelectValue placeholder="Select reason" />
												</SelectTrigger>
												<SelectContent>
													{REFUND_REASONS.map((refundReason) => (
														<SelectItem key={refundReason} value={refundReason}>
															{refundReason}
														</SelectItem>
													))}
												</SelectContent>
											</Select>

											<Textarea
												placeholder="Reason note (required when reason is other)"
												value={refundItemNoteByServiceId[service.id] ?? ""}
												onChange={(event) =>
													setRefundItemNoteByServiceId((prev) => ({
														...prev,
														[service.id]: event.target.value,
													}))
												}
												disabled={!selected}
											/>
										</div>
									);
								})}

								<Field>
									<FieldLabel htmlFor="refund-note">
										Refund note (optional)
									</FieldLabel>
									<Textarea
										id="refund-note"
										placeholder="General refund note"
										value={refundNote}
										onChange={(event) => setRefundNote(event.target.value)}
									/>
								</Field>

								<Button
									disabled={
										refundMutation.isPending ||
										refundServiceIds.length === 0 ||
										!!refundValidationError
									}
									onClick={async () => {
										if (refundValidationError) {
											toast.error(
												"Refund note is required when reason is other",
											);
											return;
										}

										await refundMutation.mutateAsync({
											orderId: id,
											payload: {
												items: selectedRefundItems,
												note: refundNote.trim() || undefined,
											},
										});
									}}
								>
									Process refund
								</Button>
							</CardContent>
						</Card>
					) : null}
				</div>

				<div className="grid gap-4 lg:col-span-8">
					{orderServices.map((service) => {
						const selectedPhotoType =
							photoTypeByServiceId[service.id] ?? "progress";
						const selectedPhotoFile = photoFileByServiceId[service.id] ?? null;

						return (
							<Card key={service.id}>
								<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
									<CardTitle className="text-base">
										{service.item_code ?? `Service #${service.id}`}
									</CardTitle>
									<div className="flex flex-wrap items-center justify-end gap-2">
										{service.is_priority ? (
											<Badge variant="warning">Priority</Badge>
										) : null}
										<Badge
											variant={getOrderServiceStatusBadgeVariant(
												service.status,
											)}
										>
											{formatOrderServiceStatus(service.status)}
										</Badge>
									</div>
								</CardHeader>
								<CardContent className="grid gap-3 text-sm">
									<p>{`Service: ${service.service?.name ?? "Service"}`}</p>
									<p>{`Item: ${service.color ?? "-"} / ${service.shoe_brand ?? "-"} / ${service.shoe_size ?? "-"}`}</p>
									<p>{`Handler: ${service.handler?.name ?? "Not assigned"}`}</p>

									<div className="flex flex-wrap gap-2">
										<Button
											size="sm"
											variant="outline"
											disabled={claimMutation.isPending}
											onClick={async () => {
												await claimMutation.mutateAsync({
													serviceId: service.id,
												});
											}}
										>
											Handled by me
										</Button>
									</div>

									<div className="flex flex-col gap-2">
										<div className="flex flex-wrap gap-2">
											{(ORDER_STATUS_TRANSITIONS[service.status] || []).map(
												(nextStatus) => {
													const isCancel = nextStatus === "cancelled";

													return (
														<ServiceStatusUpdateButton
															key={nextStatus}
															serviceId={service.id}
															nextStatus={nextStatus}
															isCancel={isCancel}
															updateStatusMutation={updateStatusMutation}
														/>
													);
												},
											)}
										</div>
									</div>

									<div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
										<Select
											value={selectedPhotoType}
											onValueChange={(value) =>
												setPhotoTypeByServiceId((prev) => ({
													...prev,
													[service.id]: (value ??
														"progress") as SaveOrderServicePhotoPayload["photo_type"],
												}))
											}
										>
											<SelectTrigger className="h-10 w-full">
												<SelectValue placeholder="Photo type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="dropoff">dropoff</SelectItem>
												<SelectItem value="progress">progress</SelectItem>
												<SelectItem value="pickup">pickup</SelectItem>
												<SelectItem value="refund">refund</SelectItem>
											</SelectContent>
										</Select>
										<input
											type="file"
											accept="image/jpeg,image/png,image/webp,image/heic"
											onChange={(event) =>
												setPhotoFileByServiceId((prev) => ({
													...prev,
													[service.id]: event.target.files?.[0] ?? null,
												}))
											}
										/>
										<Button
											variant="outline"
											disabled={
												!selectedPhotoFile || uploadPhotoMutation.isPending
											}
											onClick={async () => {
												if (!selectedPhotoFile) {
													return;
												}
												await uploadPhotoMutation.mutateAsync({
													serviceId: service.id,
													photoType: selectedPhotoType,
													file: selectedPhotoFile,
												});
											}}
										>
											Upload
										</Button>
									</div>

									<div className="grid gap-1 rounded-none border p-2">
										<p className="font-medium">Photos</p>
										{service.images.length > 0 ? (
											<div className="grid gap-2 sm:grid-cols-2">
												{service.images.map((image) => (
													<a
														key={image.id}
														href={image.image_url}
														target="_blank"
														rel="noopener"
														className="grid gap-2 border p-2"
													>
														<img
															src={image.image_url}
															alt={`${image.photo_type} for ${service.item_code ?? `service-${service.id}`}`}
															width={960}
															height={768}
															className="aspect-4/3 w-full object-cover"
															loading="lazy"
														/>
														<p className="text-xs text-muted-foreground">
															{`${image.photo_type} - ${new Date(image.created_at).toLocaleString()}`}
														</p>
													</a>
												))}
											</div>
										) : (
											<p className="text-xs text-muted-foreground">No photos</p>
										)}
									</div>

									<div className="grid gap-1 rounded-none border p-2">
										<p className="font-medium">Timeline</p>
										{service.statusLogs.length > 0 ? (
											service.statusLogs.map((log) => (
												<div
													key={log.id}
													className="grid gap-1 border-b pb-2 last:border-b-0 last:pb-0"
												>
													<p className="text-xs">
														{`${log.to_status} by ${log.changedBy?.name ?? "-"} at ${new Date(
															log.created_at,
														).toLocaleString()}`}
													</p>
													{log.note ? (
														<p className="text-xs text-muted-foreground">
															{log.note}
														</p>
													) : null}
												</div>
											))
										) : (
											<p className="text-xs text-muted-foreground">
												No status logs
											</p>
										)}
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</div>
		</>
	);
}
