import { ORDER_STATUS_TRANSITIONS } from "@fresclean/api/schema";
import { CameraIcon, LinkSimpleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CancelOrderForm } from "@/features/orders/components/cancel-order-form";
import { OrderDropoffPhotoCard } from "@/features/orders/components/order-dropoff-photo-card";
import { OrderFulfillmentOverview } from "@/features/orders/components/order-fulfillment-overview";
import { OrderPhotoGallery } from "@/features/orders/components/order-photo-gallery";
import { OrderPickupEventDialog } from "@/features/orders/components/order-pickup-event-dialog";
import { QueueServiceDetail } from "@/features/orders/components/queue-service-detail";
import { RefundOrderForm } from "@/features/orders/components/refund-order-form";
import { ServiceCancelButton } from "@/features/orders/components/service-cancel-button";
import { ServiceStatusUpdateButton } from "@/features/orders/components/service-status-update-button";
import { StatusTimeline } from "@/features/orders/components/status-timeline";
import {
	cancelOrder,
	createOrderRefund,
	deleteOrderServicePhoto,
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
	formatCancelReason,
	formatOrderServiceStatus,
	formatOrderStatus,
	formatPaymentStatus,
	formatRefundReason,
	formatRefundStatus,
	getOrderServiceStatusBadgeVariant,
	getOrderStatusBadgeVariant,
	getPaymentStatusBadgeVariant,
	getRefundStatusBadgeVariant,
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

const DeletePhotoConfirmDialog = ({
	orderId,
	serviceId,
	photoId,
}: {
	orderId: number;
	serviceId: number;
	photoId: number;
}) => {
	const queryClient = useQueryClient();
	const closeDialog = useDialog((s) => s.closeDialog);

	const deletePhotoMutation = useMutation({
		mutationFn: () => deleteOrderServicePhoto(orderId, serviceId, photoId),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: queryKeys.orderDetail(orderId),
				}),
				queryClient.invalidateQueries({ queryKey: ["orders"] }),
			]);
			toast.success("Photo deleted");
			closeDialog();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete photo",
			);
		},
	});

	return (
		<div className="grid gap-4">
			<p className="text-sm text-muted-foreground">
				You can re-upload a replacement if needed.
			</p>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={closeDialog}>
					Cancel
				</Button>
				<Button
					type="button"
					variant="destructive"
					loading={deletePhotoMutation.isPending}
					onClick={() => deletePhotoMutation.mutate()}
				>
					Delete photo
				</Button>
			</div>
		</div>
	);
};

function AdminOrderDetailPage({ orderId: id }: { orderId: number }) {
	const user = getCurrentUser();
	const isPaymentAllowed = user?.role === "admin" || user?.role === "cashier";
	const isPickupAllowed =
		user?.role === "admin" ||
		user?.role === "cashier" ||
		user?.can_process_pickup === true;
	const isAdmin = user?.role === "admin";
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

	const detailQuery = useQuery(orderDetailQueryOptions(id));

	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());

	const refreshOrderData = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.orderDetail(id) }),
			queryClient.invalidateQueries({ queryKey: ["orders"] }),
		]);
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
			await refreshOrderData();
		},
	});

	const paymentMutation = useMutation({
		mutationFn: (paymentMethodId: number) =>
			updateOrderPayment(id, { payment_method_id: paymentMethodId }),
		onSuccess: async () => {
			await refreshOrderData();
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
			await refreshOrderData();
		},
	});

	const cancelOrderMutation = useMutation({
		mutationFn: (payload: Parameters<typeof cancelOrder>[1]) =>
			cancelOrder(id, payload),
		onSuccess: async () => {
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
	const canOpenPickupDialog = isPickupAllowed && hasAnyOpenPickup;

	const openPickupDialog = () => {
		openDialog({
			title: "Record pickup",
			description: "Select the items being collected and attach a photo.",
			contentClassName: "sm:max-w-xl",
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
		(service) => !["refunded", "cancelled"].includes(service.status),
	);

	const hasCancellableServices = orderServices.some(
		(service) =>
			!["picked_up", "refunded", "cancelled"].includes(service.status),
	);
	const isPaid = detail.payment_status === "paid";
	const canCancelOrder =
		isAdmin &&
		detail.status !== "cancelled" &&
		!isPaid &&
		hasCancellableServices;
	const canRefundWholeOrder =
		isAdmin &&
		detail.status !== "cancelled" &&
		isPaid &&
		refundableServices.length > 0;

	const openCancelOrderDialog = () => {
		openDialog({
			title: "Cancel order",
			description: "All remaining items will be cancelled.",
			content: () => (
				<CancelOrderForm
					closeDialog={closeDialog}
					cancelOrderMutation={cancelOrderMutation}
				/>
			),
		});
	};

	const openRefundOrderDialog = () => {
		openDialog({
			title: "Refund order",
			description: "Select items to refund and provide reasons.",
			contentClassName: "sm:max-w-xl",
			content: () => (
				<RefundOrderForm
					closeDialog={closeDialog}
					orderId={id}
					refundableServices={refundableServices.map((service) => ({
						id: service.id,
						item_code: service.item_code ?? null,
					}))}
					refundMutation={refundMutation}
				/>
			),
		});
	};

	const trackingUrl = (() => {
		const phone = detail.customer?.phone_number ?? "";
		if (!detail.code || !phone) {
			return null;
		}
		const origin = typeof window !== "undefined" ? window.location.origin : "";
		const params = new URLSearchParams({ code: detail.code, phone });
		return `${origin}/track?${params.toString()}`;
	})();

	const handleCopyTrackingLink = async () => {
		if (!trackingUrl) {
			return;
		}
		try {
			await navigator.clipboard.writeText(trackingUrl);
			toast.success("Tracking link copied", {
				description: "Paste into WhatsApp to share with the customer.",
			});
		} catch {
			toast.error("Failed to copy tracking link");
		}
	};

	return (
		<>
			<div className="text-balance mb-4 space-y-1 sm:mb-6">
				<PageHeader
					className="mb-0"
					title={`Order ${detail.code}`}
					description={detail.customer?.name ?? "Unknown customer"}
					actions={
						<div className="flex w-full max-w-full flex-wrap items-center gap-1.5 sm:justify-end">
							<div className="flex max-w-full flex-wrap items-center gap-1.5">
								{trackingUrl ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										icon={<LinkSimpleIcon className="size-4" />}
										onClick={handleCopyTrackingLink}
									>
										Copy tracking link
									</Button>
								) : null}
								{canCancelOrder && (
									<Button
										type="button"
										variant="destructive"
										size="sm"
										disabled={cancelOrderMutation.isPending}
										onClick={openCancelOrderDialog}
									>
										Cancel order
									</Button>
								)}
								{canRefundWholeOrder && (
									<Button
										type="button"
										variant="destructive"
										size="sm"
										disabled={refundMutation.isPending}
										onClick={openRefundOrderDialog}
									>
										Refund order
									</Button>
								)}
							</div>
							<div className="flex shrink-0 items-center gap-1.5">
								<Badge
									className="h-7"
									variant={getOrderStatusBadgeVariant(detail.status)}
								>
									{formatOrderStatus(detail.status)}
								</Badge>
								<Badge
									className="h-7"
									variant={getPaymentStatusBadgeVariant(detail.payment_status)}
								>
									{formatPaymentStatus(detail.payment_status)}
								</Badge>
								{detail.refund_status !== "none" && (
									<Badge
										className="h-7"
										variant={getRefundStatusBadgeVariant(detail.refund_status)}
									>
										{formatRefundStatus(detail.refund_status)}
									</Badge>
								)}
							</div>
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
							{detail.campaigns.map((row) => (
								<div key={row.id} className="flex justify-between gap-4">
									<dt className="text-muted-foreground">
										{row.campaign?.code ?? "Campaign"}
										{row.campaign?.name ? (
											<span className="text-muted-foreground/70">
												{" "}
												· {row.campaign.name}
											</span>
										) : null}
									</dt>
									<dd>-{formatIDRCurrency(String(row.applied_amount ?? 0))}</dd>
								</div>
							))}
							<div className="flex justify-between gap-4">
								<dt className="text-muted-foreground">Discount total</dt>
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
						const availableTransitions = (
							ORDER_STATUS_TRANSITIONS[service.status] || []
						).filter((nextStatus) => !(nextStatus === "cancelled" && isPaid));

						return (
							<Card key={service.id}>
								<CardHeader className="space-y-3 pb-3">
									<div className="flex flex-row items-start justify-between gap-3">
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
									</div>
									{availableTransitions.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{availableTransitions.map((nextStatus) =>
												nextStatus === "cancelled" ? (
													<ServiceCancelButton
														key={nextStatus}
														serviceId={service.id}
														updateStatusMutation={updateStatusMutation}
													/>
												) : (
													<ServiceStatusUpdateButton
														key={nextStatus}
														serviceId={service.id}
														nextStatus={nextStatus}
														updateStatusMutation={updateStatusMutation}
													/>
												),
											)}
										</div>
									) : null}
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

									{service.status === "cancelled" && service.cancel_reason ? (
										<div className="border-destructive/40 bg-destructive/5 border p-3">
											<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
												Cancel reason
											</p>
											<p className="mt-1 text-sm font-medium">
												{formatCancelReason(service.cancel_reason)}
											</p>
											{service.cancel_note ? (
												<p className="text-muted-foreground mt-1 text-sm">
													{service.cancel_note}
												</p>
											) : null}
										</div>
									) : null}

									{service.status === "refunded" &&
									service.refundItems.length > 0 ? (
										<div className="border-destructive/40 bg-destructive/5 border p-3">
											<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
												Refund reason
											</p>
											<ul className="mt-1 grid gap-1 text-sm">
												{service.refundItems.map((item) => (
													<li key={item.id}>
														<span className="font-medium">
															{formatRefundReason(item.reason)}
														</span>
														{item.note ? (
															<span className="text-muted-foreground">
																{" "}
																— {item.note}
															</span>
														) : null}
													</li>
												))}
											</ul>
										</div>
									) : null}

									<div className="border-t pt-4">
										<p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
											Add item photo
										</p>
										<div className="grid gap-2">
											<label
												htmlFor={`service-photo-${service.id}`}
												className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 border border-border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
											>
												<CameraIcon className="size-4" />
												<span className="truncate">
													{selectedPhotoFile
														? selectedPhotoFile.name
														: `Choose photo${service.item_code ? ` for ${service.item_code}` : ""}`}
												</span>
											</label>
											<input
												id={`service-photo-${service.id}`}
												type="file"
												aria-label={`Choose photo file for ${service.item_code ?? `Service #${service.id}`}`}
												accept="image/jpeg,image/png,image/webp,image/heic"
												className="sr-only"
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

									<div className="@container space-y-2">
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
													canDelete: isAdmin || image.uploaded_by === user?.id,
												}))}
												gridClassName="@md:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4"
												thumbnailClassName="bg-muted/30"
												title={`Photos for ${service.item_code ?? `service-${service.id}`}`}
												onDelete={(photoId) => {
													openDialog({
														title: "Delete photo?",
														description:
															"This hides the photo from the order detail. The image file is retained for audit.",
														content: () => (
															<DeletePhotoConfirmDialog
																orderId={id}
																serviceId={service.id}
																photoId={photoId}
															/>
														),
													});
												}}
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
