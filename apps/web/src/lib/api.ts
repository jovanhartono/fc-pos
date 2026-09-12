import type {
	POSTOrderPickupEventPresignSchema,
	POSTOrderPickupEventSchema,
	POSTOrderSchema,
} from "@fresclean/api/schema";
import type {
	ComparableSummary,
	KpiDelta,
	ReportGranularity,
} from "@fresclean/api/types";

export type { ComparableSummary, KpiDelta, ReportGranularity };

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
export type ComplaintListItem = InferResponseType<
	typeof rpc.api.admin.complaints.$get
>["data"][number];
export type ComplaintDetail = InferResponseType<
	(typeof rpc.api.admin.complaints)[":id"]["$get"]
>["data"];
export type FetchComplaintsQuery = {
	store_id?: number;
	search?: string;
	limit?: number;
	offset?: number;
};

export type OpenComplaintPayload = {
	order_service_id: number;
	reason: string;
	start_rework?: boolean;
};
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
export type Shift = InferResponseType<
	typeof rpc.api.admin.shifts.$get
>["data"][number];
export type CurrentShift = InferResponseType<
	typeof rpc.api.admin.shifts.current.$get
>["data"];

export type FetchShiftsQuery = {
	user_id?: number;
	store_id?: number;
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
};

export type ReportOverview = InferResponseType<
	typeof rpc.api.admin.reports.overview.$get
>["data"];

export type FetchReportOverviewQuery = {
	date: string;
	store_id?: number;
	trend_days?: number;
};

export type FetchReportRangeQuery = {
	from: string;
	to: string;
	store_id?: number;
	granularity?: ReportGranularity;
};

export type FinancialReport = InferResponseType<
	typeof rpc.api.admin.reports.financial.$get
>["data"];

export type OrdersFlowReport = InferResponseType<
	(typeof rpc.api.admin.reports)["orders-flow"]["$get"]
>["data"];

export type PaymentMixReport = InferResponseType<
	(typeof rpc.api.admin.reports)["payment-mix"]["$get"]
>["data"];

export type CustomerAcquisitionReport = InferResponseType<
	(typeof rpc.api.admin.reports)["customer-acquisition"]["$get"]
>["data"];

export type RefundTrendReport = InferResponseType<
	(typeof rpc.api.admin.reports)["refund-trend"]["$get"]
>["data"];

export type WorkerProductivityReport = InferResponseType<
	(typeof rpc.api.admin.reports)["worker-productivity"]["$get"]
>["data"];

export type CampaignEffectivenessReport = InferResponseType<
	(typeof rpc.api.admin.reports)["campaign-effectiveness"]["$get"]
>["data"];

export type AgingQueueItem = InferResponseType<
	(typeof rpc.api.admin.reports)["aging-queue"]["$get"]
>["data"][number];

export interface FetchAgingQueueQuery {
	store_id?: number;
	limit?: number;
	offset?: number;
}

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
	complaints: (query?: FetchComplaintsQuery) =>
		["complaints", query ?? {}] as const,
	complaintDetail: (id: number) => ["complaint-detail", id] as const,
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
	shifts: (query?: FetchShiftsQuery) => ["shifts", query ?? {}] as const,
	shiftCurrent: ["shift-current"] as const,
	reportOverview: (query: FetchReportOverviewQuery) =>
		["report-overview", query] as const,
	financial: (query: FetchReportRangeQuery) =>
		["report-financial", query] as const,
	ordersFlow: (query: FetchReportRangeQuery) =>
		["report-orders-flow", query] as const,
	paymentMix: (query: FetchReportRangeQuery) =>
		["report-payment-mix", query] as const,
	customerAcquisition: (query: FetchReportRangeQuery) =>
		["report-customer-acquisition", query] as const,
	refundTrend: (query: FetchReportRangeQuery) =>
		["report-refund-trend", query] as const,
	workerProductivity: (query: FetchReportRangeQuery) =>
		["report-worker-productivity", query] as const,
	campaignEffectiveness: (query: FetchReportRangeQuery) =>
		["report-campaign-effectiveness", query] as const,
	agingQueue: (query?: FetchAgingQueueQuery) =>
		["report-aging-queue", query ?? {}] as const,
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

export async function fetchComplaintsPage(
	query?: FetchComplaintsQuery,
): Promise<PaginatedData<ComplaintListItem>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.complaints.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response);
}

export function fetchComplaintDetail(id: number) {
	return parseSuccessData<ComplaintDetail>(
		rpcWithAuth().api.admin.complaints[":id"].$get({
			param: { id: String(id) },
		}),
	);
}

export async function openComplaint(payload: OpenComplaintPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.complaints.$post({ json: payload }),
	);
}

export async function addComplaintRework(complaintId: number) {
	return parseResponse(
		rpcWithAuth().api.admin.complaints[":id"].rework.$post({
			param: { id: String(complaintId) },
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

export async function fetchCurrentShift() {
	return parseSuccessData<CurrentShift>(
		rpcWithAuth().api.admin.shifts.current.$get(),
	);
}

export async function fetchShifts(
	query?: FetchShiftsQuery,
): Promise<PaginatedData<Shift>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.shifts.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response);
}

export async function clockInShift(payload: { store_id: number }) {
	return parseResponse(
		rpcWithAuth().api.admin.shifts["clock-in"].$post({ json: payload }),
	);
}

export async function clockOutShift() {
	return parseResponse(rpcWithAuth().api.admin.shifts["clock-out"].$post());
}

export async function fetchReportOverview(query: FetchReportOverviewQuery) {
	return parseSuccessData<ReportOverview>(
		rpcWithAuth().api.admin.reports.overview.$get({
			query: {
				date: query.date,
				...(query.store_id !== undefined
					? { store_id: String(query.store_id) }
					: {}),
				...(query.trend_days !== undefined
					? { trend_days: String(query.trend_days) }
					: {}),
			},
		}),
	);
}

function toRangeQuery(query: FetchReportRangeQuery) {
	return {
		from: query.from,
		to: query.to,
		...(query.store_id !== undefined
			? { store_id: String(query.store_id) }
			: {}),
		...(query.granularity ? { granularity: query.granularity } : {}),
	};
}

export async function fetchFinancialReport(query: FetchReportRangeQuery) {
	return parseSuccessData<FinancialReport>(
		rpcWithAuth().api.admin.reports.financial.$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchOrdersFlowReport(query: FetchReportRangeQuery) {
	return parseSuccessData<OrdersFlowReport>(
		rpcWithAuth().api.admin.reports["orders-flow"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchPaymentMixReport(query: FetchReportRangeQuery) {
	return parseSuccessData<PaymentMixReport>(
		rpcWithAuth().api.admin.reports["payment-mix"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchCustomerAcquisitionReport(
	query: FetchReportRangeQuery,
) {
	return parseSuccessData<CustomerAcquisitionReport>(
		rpcWithAuth().api.admin.reports["customer-acquisition"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchRefundTrendReport(query: FetchReportRangeQuery) {
	return parseSuccessData<RefundTrendReport>(
		rpcWithAuth().api.admin.reports["refund-trend"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchWorkerProductivityReport(
	query: FetchReportRangeQuery,
) {
	return parseSuccessData<WorkerProductivityReport>(
		rpcWithAuth().api.admin.reports["worker-productivity"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchCampaignEffectivenessReport(
	query: FetchReportRangeQuery,
) {
	return parseSuccessData<CampaignEffectivenessReport>(
		rpcWithAuth().api.admin.reports["campaign-effectiveness"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchAgingQueueReport(
	query?: FetchAgingQueueQuery,
): Promise<PaginatedData<AgingQueueItem>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.reports["aging-queue"].$get({
			query: toSearchParams({
				store_id: query?.store_id,
				limit: query?.limit,
				offset: query?.offset,
			}),
		}),
	);
	return toPaginated(response);
}
