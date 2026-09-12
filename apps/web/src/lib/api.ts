import type {
	POSTOrderPickupEventPresignSchema,
	POSTOrderPickupEventSchema,
	POSTOrderSchema,
} from "@fresclean/api/schema";
import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import {
	type PaginatedData,
	type PhotoContentType,
	parseSuccessData,
	toPaginated,
	toSearchParams,
} from "@/lib/http";
import { rpc, rpcWithAuth } from "@/lib/rpc";

type LoginSuccessResponse = InferResponseType<typeof rpc.api.auth.login.$post>;

export type Order = InferResponseType<
	typeof rpc.api.admin.orders.$get
>["data"][number];
export type OrderServiceQueueCounts = InferResponseType<
	typeof rpc.api.admin.orders.services.queue.counts.$get
>["data"];
export type OrderDetail = InferResponseType<
	(typeof rpc.api.admin.orders)[":id"]["$get"]
>["data"];
export type OrderReceipt = InferResponseType<
	(typeof rpc.api.admin.orders)[":id"]["receipt"]["$get"]
>["data"];
// A scanned tag resolves to the object, not to one job on it (ADR-0017).
export type ItemLookup = InferResponseType<
	(typeof rpc.api.admin.orders.items)["by-item-code"]["$get"]
>["data"];
export type OrderServiceLookupById = InferResponseType<
	(typeof rpc.api.admin.orders.services)["by-id"]["$get"]
>["data"];
// The queue pages by object, each carrying the treatments still live on it.
export type QueueItem = InferResponseType<
	typeof rpc.api.admin.orders.services.queue.$get
>["data"][number];
export type QueueItemService = QueueItem["services"][number];
export type PublicTrackedOrder = InferResponseType<
	typeof rpc.api.public.orders.track.$post
>["data"];
export type LoginPayload = {
	username: string;
	password: string;
};

export type CreateOrderPayload = z.input<typeof POSTOrderSchema> & {
	voucher_codes: string[];
};

export type TrackPublicOrderPayload = {
	code: string;
	phone_number: string;
};

export type FetchOrdersQuery = {
	limit?: number;
	offset?: number;
	search?: string;
	store_id?: number;
	status?:
		| "created"
		| "processing"
		| "ready_for_pickup"
		| "completed"
		| "cancelled";
	payment_status?: "paid" | "unpaid";
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
		| "quality_check"
		| "qc_reject"
		| "ready_for_pickup"
		| "picked_up"
		| "refunded"
		| "cancelled";
	date_from?: string;
	date_to?: string;
};

export type OrderCancelReason =
	| "customer_request"
	| "cannot_process"
	| "damaged_intake"
	| "duplicate_order"
	| "other";

export type UpdateOrderServiceStatusPayload = {
	cancel_note?: string;
	cancel_reason?: OrderCancelReason;
	note?: string;
	status:
		| "queued"
		| "processing"
		| "quality_check"
		| "qc_reject"
		| "ready_for_pickup"
		| "picked_up"
		| "refunded"
		| "cancelled";
};

// ADR-0018: promos ride with the tender only for an Order that arrived
// unpriced and had nothing to settle at drop-off — the campaigns the cashier
// ticked, the voucher slips handed over, and the hand-keyed discount. An Order
// whose discount already settled must send none of them.
export type UpdateOrderPaymentPayload = {
	payment_method_id: number;
	campaign_ids: number[];
	voucher_codes: string[];
	discount: string;
};

// The price for a no-list-price line, keyed once it is agreed with the
// customer — or re-keyed to fix a typo while the Order is unpaid (ADR-0018).
// A digit string, like every money payload.
export type SetOrderServicePricePayload = {
	price: string;
};

export type UpdateOrderCourierPayload = {
	collected_by: number | null;
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

export type OrderRefundReason =
	| "damaged"
	| "cannot_process"
	| "lost"
	| "other"
	| "customer_cancelled";

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

export const queryKeys = {
	orders: (query?: FetchOrdersQuery) => ["orders", query ?? {}] as const,
	orderDetail: (id: number) => ["order-detail", id] as const,
	orderServiceLookup: (itemCode: string) =>
		["order-service-lookup", itemCode] as const,
	orderServiceQueue: (
		query?: Pick<
			FetchOrderServiceQueueQuery,
			"store_id" | "search" | "status" | "date_from" | "date_to"
		>,
	) => ["order-service-queue", query ?? {}] as const,
	orderServiceQueueCounts: (storeId?: number) =>
		["order-service-queue-counts", storeId ?? null] as const,
};

export async function login(payload: LoginPayload) {
	return parseSuccessData<LoginSuccessResponse["data"]>(
		rpc.api.auth.login.$post({ json: payload }),
	);
}

export async function fetchOrdersPage(
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

export async function createOrder(payload: CreateOrderPayload) {
	return parseResponse(rpcWithAuth().api.admin.orders.$post({ json: payload }));
}

export async function fetchOrderDetail(id: number) {
	return parseSuccessData<OrderDetail>(
		rpcWithAuth().api.admin.orders[":id"].$get({
			param: { id: String(id) },
		}),
	);
}

export async function fetchOrderReceipt(id: number) {
	return parseSuccessData<OrderReceipt>(
		rpcWithAuth().api.admin.orders[":id"].receipt.$get({
			param: { id: String(id) },
		}),
	);
}

export async function lookupItemByItemCode(itemCode: string) {
	return parseSuccessData<ItemLookup>(
		rpcWithAuth().api.admin.orders.items["by-item-code"].$get({
			query: { item_code: itemCode },
		}),
	);
}

export async function lookupOrderServiceById(serviceId: number) {
	return parseSuccessData<OrderServiceLookupById>(
		rpcWithAuth().api.admin.orders.services["by-id"].$get({
			query: { service_id: String(serviceId) },
		}),
	);
}

export async function fetchOrderServiceQueuePage(
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

export async function fetchOrderServiceQueueCounts(storeId?: number) {
	const response = await parseResponse(
		rpcWithAuth().api.admin.orders.services.queue.counts.$get({
			query: toSearchParams({ store_id: storeId }),
		}),
	);

	return response.data;
}

export async function updateOrderServiceStatus(
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

export async function updateOrderPayment(
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

export async function setOrderServicePrice(
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

export async function updateOrderCourier(
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

export async function presignItemPhoto(
	orderId: number,
	itemId: number,
	payload: PresignItemPhotoPayload,
) {
	return parseSuccessData<{
		upload_url: string;
		key: string;
		expires_in_seconds: number;
	}>(
		rpcWithAuth().api.admin.orders[":id"].items[":itemId"].photos.presign.$post(
			{
				param: { id: String(orderId), itemId: String(itemId) },
				json: payload,
			},
		),
	);
}

export async function saveItemPhoto(
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

export async function deleteItemPhoto(
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

export type PhotoDownloadRef = {
	kind: "item" | "dropoff" | "pickup";
	id: number;
};

export async function createPhotoDownloadUrl(photo: PhotoDownloadRef) {
	return parseSuccessData<{ url: string }>(
		rpcWithAuth().api.admin.photos["download-url"].$post({ json: photo }),
	);
}

export async function presignOrderDropoffPhoto(
	orderId: number,
	payload: PresignOrderDropoffPhotoPayload,
) {
	return parseSuccessData<{
		upload_url: string;
		key: string;
		expires_in_seconds: number;
	}>(
		rpcWithAuth().api.admin.orders[":id"]["dropoff-photo"].presign.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function saveOrderDropoffPhoto(
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

export async function presignOrderPickupEvent(
	orderId: number,
	payload: PresignOrderPickupEventPayload,
) {
	return parseSuccessData<{
		upload_url: string;
		key: string;
		expires_in_seconds: number;
	}>(
		rpcWithAuth().api.admin.orders[":id"]["pickup-events"].presign.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function createOrderPickupEvent(
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

export async function createOrderRefund(
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

export async function cancelOrder(
	orderId: number,
	payload: CancelOrderPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].cancel.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function trackPublicOrder(payload: TrackPublicOrderPayload) {
	return parseSuccessData<PublicTrackedOrder>(
		rpc.api.public.orders.track.$post({ json: payload }),
	);
}
