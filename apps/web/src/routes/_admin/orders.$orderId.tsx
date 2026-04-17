import { ORDER_STATUS_TRANSITIONS } from "@fresclean/api/schema";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { OrderDropoffPhotoCard } from "@/features/orders/components/order-dropoff-photo-card";
import { OrderFulfillmentOverview } from "@/features/orders/components/order-fulfillment-overview";
import { OrderPhotoGallery } from "@/features/orders/components/order-photo-gallery";
import { OrderPickupEventDialog } from "@/features/orders/components/order-pickup-event-dialog";
import { QueueServiceDetail } from "@/features/orders/components/queue-service-detail";
import { StatusTimeline } from "@/features/orders/components/status-timeline";
import {
	createOrderRefund,
	type OrderDetail,
	presignOrderServicePhoto,
	queryKeys,
	saveOrderServicePhoto,
	type UpdateOrderServiceStatusPayload,
	updateOrderPayment,
	updateOrderServiceStatus,
	uploadFileToPresignedUrl,
} from "@/lib/api";
import { formatOrderServiceItemDetails } from "@/lib/order-service-item-details";
import {
	orderDetailQueryOptions,
	paymentMethodsQueryOptions,
} from "@/lib/query-options";
import {
	formatOrderServiceStatus,
	formatOrderStatus,
	formatPaymentStatus,
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

const STATUS_ACTION_LABELS: Record<
	UpdateOrderServiceStatusPayload["status"],
	string
> = {
	queued: "Queue",
	processing: "Process",
	quality_check: "Quality Check",
	ready_for_pickup: "Ready for Pickup",
	picked_up: "Pick Up",
	refunded: "Refund",
	cancelled: "Cancel",
};

const IN_PROGRESS_SERVICE_STATUSES = new Set([
	"queued",
	"processing",
	"quality_check",
]);

const REFUND_REASONS = ["damaged", "cannot_process", "lost", "other"] as const;

function OrderDetailSkeleton() {
	return (
		<div className="grid gap-6">
			<div className="flex items-center justify-between gap-3">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-9 w-32" />
			</div>
			<div className="grid gap-4 md:grid-cols-[2fr_1fr]">
				<div className="grid gap-4">
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-64 w-full" />
				</div>
				<div className="grid gap-4">
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-48 w-full" />
				</div>
			</div>
		</div>
	);
}

function OrderDetailMessage({
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
			className={
				tone === "error"
					? "grid gap-1 border border-destructive/40 bg-destructive/5 p-6 text-sm"
					: "grid gap-1 border border-border/70 bg-muted/30 p-6 text-sm"
			}
		>
			<p className="font-medium">{title}</p>
			<p className="text-muted-foreground">{description}</p>
		</div>
	);
}

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
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);

	const handleClick = () => {
		openDialog({
			title: isCancel
				? "Cancel Service"
				: `Update Status to ${STATUS_ACTION_LABELS[nextStatus]}`,
			description: isCancel
				? "Please provide a reason for cancelling this service."
				: `Are you sure you want to change the status to ${STATUS_ACTION_LABELS[nextStatus]}?`,
			content: () => (
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
	const isPending = updateStatusMutation.isPending;

	const handleConfirm = async () => {
		await updateStatusMutation.mutateAsync({
			serviceId,
			payload: {
				status: nextStatus,
				note: note.trim() || undefined,
			},
		});
		closeDialog();
	};

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
					disabled={isPending || (isCancel && !note.trim())}
					onClick={handleConfirm}
				>
					{isPending
						? "Saving…"
						: isCancel
							? "Confirm Cancel"
							: "Confirm Update"}
				</Button>
			</div>
		</div>
	);
}

function OrderDetailPage() {
	const search = Route.useSearch();
	const { orderId } = Route.useParams();
	const parsedOrderId = Number(orderId);
	const isValidOrderId = Number.isInteger(parsedOrderId) && parsedOrderId > 0;

	if (!isValidOrderId) {
		return (
			<OrderDetailMessage
				tone="error"
				title="Invalid order ID"
				description="The URL does not point to a valid order."
			/>
		);
	}

	if (search.workerServiceId) {
		return (
			<QueueServiceDetail
				orderId={parsedOrderId}
				serviceId={search.workerServiceId}
				queueStoreId={search.queueStoreId}
			/>
		);
	}

	return <AdminOrderDetailPage orderId={parsedOrderId} />;
}

type PickupEvent = OrderDetail["pickup_events"][number];

function OrderPickupHistoryCard({
	pickupEvents,
}: {
	pickupEvents: PickupEvent[];
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Pickup history</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3">
				{pickupEvents.map((event) => {
					const pickedUpAt = new Date(event.picked_up_at).toLocaleString(
						"en-ID",
						{
							dateStyle: "medium",
							timeStyle: "short",
						},
					);
					const pickedUpBy = event.picked_up_by?.name ?? "unknown operator";

					return (
						<div key={event.id} className="grid gap-2 border p-2 text-sm">
							{event.image_url ? (
								<img
									src={event.image_url}
									alt={`Pickup on ${pickedUpAt} by ${pickedUpBy}`}
									width={640}
									height={400}
									className="aspect-16/10 w-full border object-cover"
									loading="lazy"
								/>
							) : null}
							<div className="grid gap-0.5">
								<p className="font-medium">{pickedUpAt}</p>
								<p className="text-muted-foreground text-xs">by {pickedUpBy}</p>
							</div>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

function AdminOrderDetailPage({ orderId: id }: { orderId: number }) {
	const user = getCurrentUser();
	const isPaymentAllowed = user?.role === "admin" || user?.role === "cashier";
	const isPickupAllowed =
		user?.role === "admin" ||
		user?.role === "cashier" ||
		user?.can_process_pickup === true;
	const isRefundAllowed = isPaymentAllowed;
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);

	const queryClient = useQueryClient();

	const [photoFileByServiceId, setPhotoFileByServiceId] = useState<
		Record<number, File | null>
	>({});
	const [photoNoteByServiceId, setPhotoNoteByServiceId] = useState<
		Record<number, string>
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

	const detailQuery = useQuery(orderDetailQueryOptions(id));

	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());

	const refreshOrderData = async () => {
		await queryClient.invalidateQueries({
			queryKey: queryKeys.orderDetail(id),
		});
		await queryClient.invalidateQueries({ queryKey: ["orders"] });
	};

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

	const uploadPhotoMutation = useMutation({
		mutationFn: async ({
			serviceId,
			file,
			note,
		}: {
			serviceId: number;
			file: File;
			note?: string;
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
			});
			await uploadFileToPresignedUrl(presigned.upload_url, file, contentType);
			await saveOrderServicePhoto(id, serviceId, {
				image_path: presigned.key,
				note,
			});
		},
		onSuccess: async (_, variables) => {
			toast.success("Photo uploaded");
			setPhotoFileByServiceId((prev) => ({
				...prev,
				[variables.serviceId]: null,
			}));
			setPhotoNoteByServiceId((prev) => ({
				...prev,
				[variables.serviceId]: "",
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

	if (detailQuery.isPending) {
		return <OrderDetailSkeleton />;
	}

	if (detailQuery.isError) {
		return (
			<OrderDetailMessage
				tone="error"
				title="Failed to load order"
				description={
					detailQuery.error instanceof Error
						? detailQuery.error.message
						: "Please try again in a moment."
				}
			/>
		);
	}

	if (!detailQuery.data) {
		return (
			<OrderDetailMessage
				tone="muted"
				title="Order not found"
				description="It may have been deleted or you may not have access."
			/>
		);
	}

	const detail = detailQuery.data;
	const paymentMethods = Array.isArray(paymentMethodsQuery.data)
		? paymentMethodsQuery.data
		: [];
	const orderServices = Array.isArray(detail.services) ? detail.services : [];
	const readyForPickupServices = orderServices.filter(
		(service) => service.status === "ready_for_pickup",
	);
	const pickupEvents = Array.isArray(detail.pickup_events)
		? detail.pickup_events
		: [];
	const hasAnyOpenPickup = readyForPickupServices.length > 0;
	const hasInProgressWork = orderServices.some((service) =>
		IN_PROGRESS_SERVICE_STATUSES.has(service.status),
	);
	const canOpenPickupDialog =
		isPickupAllowed && hasAnyOpenPickup && !hasInProgressWork;

	const openPickupDialog = () => {
		openDialog({
			title: "Record pickup",
			description: "Select the items being collected and attach a photo.",
			content: () => (
				<OrderPickupEventDialog
					closeDialog={closeDialog}
					orderId={id}
					readyServices={readyForPickupServices}
				/>
			),
		});
	};

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
			<div className="text-balance mb-4 space-y-1 sm:mb-6">
				<PageHeader
					className="mb-0"
					title={`Order ${detail.code}`}
					description={detail.customer?.name ?? "Unknown customer"}
					actions={
						<div className="flex max-w-full flex-wrap justify-end gap-1.5">
							<Badge variant={getOrderStatusBadgeVariant(detail.status)}>
								{formatOrderStatus(detail.status)}
							</Badge>
							<Badge
								variant={getPaymentStatusBadgeVariant(detail.payment_status)}
							>
								{formatPaymentStatus(detail.payment_status)}
							</Badge>
						</div>
					}
				/>
				<p className="text-muted-foreground text-sm">
					{detail.store?.name ?? "—"} ·{" "}
					{new Date(detail.created_at).toLocaleString("en-ID", {
						dateStyle: "medium",
						timeStyle: "short",
					})}
				</p>
			</div>

			<div className="mb-4 grid gap-3 sm:mb-6 sm:gap-4">
				<OrderFulfillmentOverview
					order={detail}
					canCompletePickup={canOpenPickupDialog}
					isCompleting={false}
					onCompletePickup={async () => {
						openPickupDialog();
					}}
				/>
			</div>

			<Card className="mb-4 sm:mb-6">
				<CardContent className="grid gap-4 pt-5 sm:grid-cols-3 sm:gap-6 sm:pt-6">
					<div className="space-y-1.5">
						<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
							Customer
						</p>
						<p className="font-medium leading-snug">
							{detail.customer?.name ?? "—"}
						</p>
						<p className="text-muted-foreground text-sm">
							{detail.customer?.phone_number ?? "—"}
						</p>
					</div>
					<div className="space-y-1.5">
						<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
							Notes
						</p>
						<p className="text-sm leading-relaxed">
							{detail.notes?.trim() ? detail.notes : "—"}
						</p>
					</div>
					<div className="space-y-2">
						<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
							Totals
						</p>
						<dl className="space-y-1.5 text-sm tabular-nums">
							<div className="flex justify-between gap-4">
								<dt className="text-muted-foreground">Subtotal</dt>
								<dd>{formatIDRCurrency(String(detail.total ?? 0))}</dd>
							</div>
							<div className="flex justify-between gap-4">
								<dt className="text-muted-foreground">Discount</dt>
								<dd>-{formatIDRCurrency(String(detail.discount ?? 0))}</dd>
							</div>
						</dl>
						<Separator />
						<dl className="space-y-1.5 text-sm tabular-nums">
							<div className="flex justify-between gap-4 font-medium">
								<dt>Net</dt>
								<dd>
									{formatIDRCurrency(
										String(
											Number(detail.total ?? 0) - Number(detail.discount ?? 0),
										),
									)}
								</dd>
							</div>
							{Number(detail.refunded_amount) > 0 ? (
								<div className="text-destructive flex justify-between gap-4">
									<dt>Refunded</dt>
									<dd>
										-{formatIDRCurrency(String(detail.refunded_amount ?? 0))}
									</dd>
								</div>
							) : null}
						</dl>
					</div>
				</CardContent>
			</Card>

			<div className="grid items-start gap-3 sm:gap-4 lg:grid-cols-12">
				<div className="grid gap-3 sm:gap-4 lg:col-span-4">
					<OrderDropoffPhotoCard
						order={detail}
						canManage={
							user?.role === "admin" ||
							user?.role === "cashier" ||
							user?.role === "worker"
						}
						onUploaded={refreshOrderData}
					/>

					{pickupEvents.length > 0 ? (
						<OrderPickupHistoryCard pickupEvents={pickupEvents} />
					) : null}

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
									<SelectTrigger size="md" className="w-full">
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
										<div key={service.id} className="grid gap-2 border p-3">
											<Field orientation="horizontal">
												<Checkbox
													id={`refund-service-${service.id}`}
													checked={selected}
													onCheckedChange={(value) => {
														if (value) {
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
												<FieldLabel htmlFor={`refund-service-${service.id}`}>
													{service.item_code ?? `Service #${service.id}`}
												</FieldLabel>
											</Field>

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
												<SelectTrigger size="md" className="w-full">
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
												placeholder="Reason note"
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

				<div className="grid gap-3 sm:gap-4 lg:col-span-8">
					{detail.products.length > 0 ? (
						<Card>
							<CardHeader>
								<CardTitle>Products</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid gap-2">
									{detail.products.map((item) => (
										<div
											key={item.id}
											className="flex items-center justify-between gap-4 border px-3 py-2.5 text-sm"
										>
											<div className="min-w-0">
												<p className="font-medium leading-snug">
													{item.product?.name ?? `Product #${item.product_id}`}
												</p>
												<p className="text-muted-foreground text-xs">
													{formatIDRCurrency(String(item.price ?? 0))} x{" "}
													{item.qty}
													{item.notes ? ` · ${item.notes}` : ""}
												</p>
											</div>
											<p className="shrink-0 font-mono text-sm tabular-nums">
												{formatIDRCurrency(String(item.subtotal ?? 0))}
											</p>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					) : null}
					{orderServices.map((service) => {
						const selectedPhotoFile = photoFileByServiceId[service.id] ?? null;
						const selectedPhotoNote = photoNoteByServiceId[service.id] ?? "";

						return (
							<Card key={service.id}>
								<CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
									<div className="min-w-0 space-y-1">
										<CardTitle className="text-base leading-snug">
											{service.item_code ?? `Service #${service.id}`}
										</CardTitle>
										<p className="text-muted-foreground text-sm">
											{service.service?.name ?? "Service"}
										</p>
									</div>
									<div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
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
								<CardContent className="space-y-5 text-sm">
									<dl className="grid gap-3 sm:grid-cols-2">
										<div>
											<dt className="text-muted-foreground text-xs">Item</dt>
											<dd className="mt-0.5 font-medium">
												{formatOrderServiceItemDetails(service)}
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-xs">Handler</dt>
											<dd className="mt-0.5 font-medium">
												{service.handler?.name ?? "Unassigned"}
											</dd>
										</div>
									</dl>

									<div className="flex flex-wrap gap-2 border-t pt-4">
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

									<div className="border-t pt-4">
										<p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
											Add item photo
										</p>
										<div className="grid gap-2">
											<input
												type="file"
												aria-label={`Choose photo file for ${service.item_code ?? `Service #${service.id}`}`}
												accept="image/jpeg,image/png,image/webp,image/heic"
												className="text-muted-foreground w-full text-sm"
												onChange={(event) =>
													setPhotoFileByServiceId((prev) => ({
														...prev,
														[service.id]: event.target.files?.[0] ?? null,
													}))
												}
											/>
											<Input
												placeholder="Optional note (e.g. outsole cracked)"
												value={selectedPhotoNote}
												onChange={(event) =>
													setPhotoNoteByServiceId((prev) => ({
														...prev,
														[service.id]: event.target.value,
													}))
												}
												aria-label={`Photo note for ${service.item_code ?? `Service #${service.id}`}`}
											/>
											<Button
												variant="secondary"
												className="sm:self-end"
												disabled={
													!selectedPhotoFile || uploadPhotoMutation.isPending
												}
												onClick={async () => {
													if (!selectedPhotoFile) {
														return;
													}
													await uploadPhotoMutation.mutateAsync({
														serviceId: service.id,
														file: selectedPhotoFile,
														note: selectedPhotoNote.trim() || undefined,
													});
												}}
											>
												Upload
											</Button>
										</div>
									</div>

									<div className="space-y-2">
										<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
											Photos ({service.images.length})
										</p>
										{service.images.length > 0 ? (
											<OrderPhotoGallery
												items={service.images.map((image) => ({
													...image,
													alt:
														image.note ??
														`Photo for ${service.item_code ?? `service-${service.id}`}`,
												}))}
												gridClassName="sm:grid-cols-2"
												thumbnailClassName="bg-muted/30"
												title={`Photos for ${service.item_code ?? `service-${service.id}`}`}
											/>
										) : (
											<p className="text-muted-foreground text-sm">None yet</p>
										)}
									</div>

									<StatusTimeline logs={service.statusLogs} />
								</CardContent>
							</Card>
						);
					})}
				</div>
			</div>
		</>
	);
}
