import type {
	POSTOrderPickupEventPresignSchema,
	POSTOrderPickupEventSchema,
	POSTOrderSchema,
	QUEUE_CATEGORY_MODES,
} from "@fresclean/api/schema";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import {
	type PaginatedData,
	type PhotoContentType,
	parseSuccessData,
	toPaginated,
	toSearchParams,
} from "@/lib/http";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type Order = InferResponseType<
	typeof rpc.api.admin.orders.$get
>["data"][number];

export type OrderDetail = InferResponseType<
	(typeof rpc.api.admin.orders)[":id"]["$get"]
>["data"];

export type OrderReceipt = InferResponseType<
	(typeof rpc.api.admin.orders)[":id"]["receipt"]["$get"]
>["data"];

// The queue's line-detail screen: one line plus enough of its Order to label
// it (ADR-0016: no pickup_code here — that stays on the Order detail).
export type OrderServiceDetail = InferResponseType<
	(typeof rpc.api.admin.orders)[":id"]["services"][":serviceId"]["$get"]
>["data"];

// One box for every way a worker names a target: a scanned tag, a typed order
// id, or a typed line id (ADR-0017).
export type OrderLookup = InferResponseType<
	typeof rpc.api.admin.orders.lookup.$get
>["data"];

// The Queue pages by Item, each carrying the OrderServices still open on it.
export type QueueItem = InferResponseType<
	typeof rpc.api.admin.orders.services.queue.$get
>["data"][number];

export type QueueItemService = QueueItem["services"][number];

export type FetchOrdersQuery = {
	limit?: number;
	offset?: number;
	search?: string;
	customer_id?: number;
	store_id?: number;
	status?:
		| "created"
		| "processing"
		| "ready_for_pickup"
		| "completed"
		| "cancelled";
	payment_status?: "paid" | "unpaid";
	payment_method_id?: number;
	refund_status?: "any" | "partial" | "full";
	notified?: "yes" | "no";
	overdue?: boolean;
	date_from?: string;
	date_to?: string;
};

export type FetchOrderServiceQueueQuery = {
	limit?: number;
	offset?: number;
	search?: string;
	store_id?: number;
	status?:
		| "queued"
		| "processing"
		| "waiting_qc"
		| "qc_reject"
		| "ready_for_pickup"
		| "picked_up"
		| "refunded"
		| "cancelled";
	date_from?: string;
	date_to?: string;
	category_id?: number;
	category_mode?: QueueCategoryMode;
};

export type QueueCategoryMode = (typeof QUEUE_CATEGORY_MODES)[number];

export type CreateOrderPayload = z.input<typeof POSTOrderSchema> & {
	voucher_codes: string[];
};

export type OrderCancelReason =
	| "customer_request"
	| "cannot_process"
	| "damaged_intake"
	| "duplicate_order"
	| "other";

export type OrderRefundReason =
	| "damaged"
	| "cannot_process"
	| "lost"
	| "other"
	| "customer_cancelled";

export type UpdateOrderServiceStatusPayload = {
	cancel_note?: string;
	cancel_reason?: OrderCancelReason;
	note?: string;
	status:
		| "queued"
		| "processing"
		| "waiting_qc"
		| "qc_reject"
		| "ready_for_pickup"
		| "picked_up"
		| "refunded"
		| "cancelled";
};

// ADR-0018: discounts go with the payment only for an Order that came in
// unpriced; an Order whose discount settled at drop-off must send none.
export type UpdateOrderPaymentPayload = {
	payment_method_id: number;
	campaign_ids: number[];
	voucher_codes: string[];
	discount: string;
};

export type PaymentCharge = InferResponseType<
	(typeof rpc.api.admin.orders)[":id"]["payment-charges"][":chargeId"]["$get"]
>["data"];

export type CreatePaymentChargePayload = Omit<
	UpdateOrderPaymentPayload,
	"payment_method_id"
> & { kind: "qris" };

// A Repair's price, keyed once agreed with the Customer or re-keyed to fix a
// typo while the Order is unpaid (ADR-0018).
export type SetOrderServicePricePayload = {
	price: string;
};

export type UpdateOrderCourierPayload = {
	collected_by: number | null;
};

export type CreateOrderRefundPayload = {
	note?: string;
	items: Array<
		({ order_service_id: number } | { order_product_id: number }) & {
			reason: OrderRefundReason;
			note?: string;
		}
	>;
};

export type CancelOrderPayload = {
	items: Array<
		({ order_service_id: number } | { order_product_id: number }) & {
			reason: OrderCancelReason;
			note?: string;
		}
	>;
};

export type PresignItemPhotoPayload = {
	content_type: PhotoContentType;
};

export type SaveItemPhotoPayload = {
	image_path: string;
	note?: string;
};

export type PresignOrderDropoffPhotoPayload = {
	content_type: PhotoContentType;
};

export type SaveOrderDropoffPhotoPayload = {
	image_path: string;
};

export type PresignOrderPickupEventPayload = z.infer<
	typeof POSTOrderPickupEventPresignSchema
>;

export type CreateOrderPickupEventPayload = z.infer<
	typeof POSTOrderPickupEventSchema
>;

export type PhotoDownloadRef = {
	kind: "item" | "dropoff" | "pickup";
	id: number;
};

type PresignedUpload = {
	upload_url: string;
	key: string;
	expires_in_seconds: number;
};

// Every screen that shows an Order or one of its Items keys under "orders", so
// a single prefix covers the order page, the /orders list and the /queue strip.
export const ordersKeys = {
	all: ["orders"] as const,
	lists: () => [...ordersKeys.all, "list"] as const,
	list: (query?: FetchOrdersQuery) =>
		[...ordersKeys.lists(), query ?? {}] as const,
	detail: (id: number) => [...ordersKeys.all, "detail", id] as const,
	receipt: (id: number) => [...ordersKeys.detail(id), "receipt"] as const,
	orderService: (orderId: number, serviceId: number) =>
		[...ordersKeys.all, "service", orderId, serviceId] as const,
	paymentCharge: (orderId: number, chargeId: number) =>
		[...ordersKeys.detail(orderId), "payment-charge", chargeId] as const,
	queues: () => [...ordersKeys.all, "queue"] as const,
	queue: (query?: FetchOrderServiceQueueQuery) =>
		[...ordersKeys.queues(), query ?? {}] as const,
};

async function fetchOrdersPage(
	query?: FetchOrdersQuery,
): Promise<PaginatedData<Order>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.orders.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response);
}

export function fetchOrderDetail(id: number) {
	return parseSuccessData<OrderDetail>(
		rpcWithAuth().api.admin.orders[":id"].$get({
			param: { id: String(id) },
		}),
	);
}

export function fetchOrderReceipt(id: number) {
	return parseSuccessData<OrderReceipt>(
		rpcWithAuth().api.admin.orders[":id"].receipt.$get({
			param: { id: String(id) },
		}),
	);
}

export function fetchOrderService(orderId: number, serviceId: number) {
	return parseSuccessData<OrderServiceDetail>(
		rpcWithAuth().api.admin.orders[":id"].services[":serviceId"].$get({
			param: { id: String(orderId), serviceId: String(serviceId) },
		}),
	);
}

async function fetchOrderServiceQueuePage(
	query?: FetchOrderServiceQueueQuery,
): Promise<PaginatedData<QueueItem>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.orders.services.queue.$get({
			query:
				query && Object.keys(query).length > 0 ? toSearchParams(query) : {},
		}),
	);

	return toPaginated(response);
}

export const ordersQueries = {
	list: (query?: FetchOrdersQuery) =>
		queryOptions({
			queryKey: ordersKeys.list(query),
			queryFn: () => fetchOrdersPage(query),
		}),
	detail: (id: number) =>
		queryOptions({
			queryKey: ordersKeys.detail(id),
			queryFn: () => fetchOrderDetail(id),
		}),
	receipt: (id: number) =>
		queryOptions({
			queryKey: ordersKeys.receipt(id),
			queryFn: () => fetchOrderReceipt(id),
		}),
	orderService: (orderId: number, serviceId: number) =>
		queryOptions({
			queryKey: ordersKeys.orderService(orderId, serviceId),
			queryFn: () => fetchOrderService(orderId, serviceId),
		}),
	// The cashier holds the QR up to the Customer; the gateway's notice or the
	// server's own check flips it, so this asks every 3 s until it settles.
	paymentCharge: (orderId: number, chargeId: number) =>
		queryOptions({
			queryKey: ordersKeys.paymentCharge(orderId, chargeId),
			queryFn: () => fetchPaymentCharge(orderId, chargeId),
			refetchInterval: (query) =>
				query.state.data?.status === "pending" ? 3000 : false,
		}),
	queue: (query?: FetchOrderServiceQueueQuery) =>
		infiniteQueryOptions({
			queryKey: ordersKeys.queue(query),
			initialPageParam: 0,
			queryFn: ({ pageParam }) =>
				fetchOrderServiceQueuePage({ ...query, offset: pageParam }),
			getNextPageParam: (lastPage) => {
				const nextOffset = lastPage.meta.offset + lastPage.meta.limit;
				return nextOffset < lastPage.meta.total ? nextOffset : undefined;
			},
		}),
};

export function createOrder(payload: CreateOrderPayload) {
	return parseResponse(rpcWithAuth().api.admin.orders.$post({ json: payload }));
}

export function lookupQueueTarget(q: string) {
	return parseSuccessData<OrderLookup>(
		rpcWithAuth().api.admin.orders.lookup.$get({ query: { q } }),
	);
}

export function updateOrderServiceStatus(
	orderId: number,
	serviceId: number,
	payload: UpdateOrderServiceStatusPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].services[":serviceId"].status.$patch({
			param: { id: String(orderId), serviceId: String(serviceId) },
			json: payload,
		}),
	);
}

export function updateOrderPayment(
	orderId: number,
	payload: UpdateOrderPaymentPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].payment.$patch({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export function createPaymentCharge(
	orderId: number,
	payload: CreatePaymentChargePayload,
) {
	return parseSuccessData<PaymentCharge>(
		rpcWithAuth().api.admin.orders[":id"]["payment-charges"].$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export function fetchPaymentCharge(orderId: number, chargeId: number) {
	return parseSuccessData<PaymentCharge>(
		rpcWithAuth().api.admin.orders[":id"]["payment-charges"][":chargeId"].$get({
			param: { id: String(orderId), chargeId: String(chargeId) },
		}),
	);
}

export function cancelPaymentCharge(orderId: number, chargeId: number) {
	return parseSuccessData<PaymentCharge>(
		rpcWithAuth().api.admin.orders[":id"]["payment-charges"][
			":chargeId"
		].cancel.$post({
			param: { id: String(orderId), chargeId: String(chargeId) },
		}),
	);
}

export function setOrderServicePrice(
	orderId: number,
	serviceId: number,
	payload: SetOrderServicePricePayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].services[":serviceId"].price.$patch({
			param: { id: String(orderId), serviceId: String(serviceId) },
			json: payload,
		}),
	);
}

export function updateOrderCourier(
	orderId: number,
	payload: UpdateOrderCourierPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].courier.$patch({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export function createOrderRefund(
	orderId: number,
	payload: CreateOrderRefundPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].refunds.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export function cancelOrder(orderId: number, payload: CancelOrderPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].cancel.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export function presignItemPhoto(
	orderId: number,
	itemId: number,
	payload: PresignItemPhotoPayload,
) {
	return parseSuccessData<PresignedUpload>(
		rpcWithAuth().api.admin.orders[":id"].items[":itemId"].photos.presign.$post(
			{
				param: { id: String(orderId), itemId: String(itemId) },
				json: payload,
			},
		),
	);
}

export function saveItemPhoto(
	orderId: number,
	itemId: number,
	payload: SaveItemPhotoPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].items[":itemId"].photos.$post({
			param: { id: String(orderId), itemId: String(itemId) },
			json: payload,
		}),
	);
}

export function deleteItemPhoto(
	orderId: number,
	itemId: number,
	photoId: number,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].items[":itemId"].photos[
			":photoId"
		].$delete({
			param: {
				id: String(orderId),
				itemId: String(itemId),
				photoId: String(photoId),
			},
		}),
	);
}

export function presignOrderDropoffPhoto(
	orderId: number,
	payload: PresignOrderDropoffPhotoPayload,
) {
	return parseSuccessData<PresignedUpload>(
		rpcWithAuth().api.admin.orders[":id"]["dropoff-photo"].presign.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export function saveOrderDropoffPhoto(
	orderId: number,
	payload: SaveOrderDropoffPhotoPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"]["dropoff-photo"].$put({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export function presignOrderPickupEvent(
	orderId: number,
	payload: PresignOrderPickupEventPayload,
) {
	return parseSuccessData<PresignedUpload>(
		rpcWithAuth().api.admin.orders[":id"]["pickup-events"].presign.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export function createOrderPickupEvent(
	orderId: number,
	payload: CreateOrderPickupEventPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"]["pickup-events"].$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export function createOrderPickupNotice(orderId: number) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"]["pickup-notices"].$post({
			param: { id: String(orderId) },
		}),
	);
}

export function createPhotoDownloadUrl(photo: PhotoDownloadRef) {
	return parseSuccessData<{ url: string }>(
		rpcWithAuth().api.admin.photos["download-url"].$post({ json: photo }),
	);
}
