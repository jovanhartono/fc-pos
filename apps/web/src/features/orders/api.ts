import type { QUEUE_CATEGORY_MODES } from "@fresclean/api/rules";
import type {
  POSTOrderPickupEventPresignSchema,
  POSTOrderPickupEventSchema,
  POSTOrderSchema,
} from "@fresclean/api/schema";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { InferResponseType } from "hono/client";
import type { z } from "zod";

import { parseSuccessData, toPaginated, toSearchParams } from "@/lib/http";
import type { PaginatedData, PhotoContentType } from "@/lib/http";
import { rpc } from "@/lib/rpc";

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

export interface FetchOrdersQuery {
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
  paid_from?: string;
  paid_to?: string;
}

export interface FetchOrderServiceQueueQuery {
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
}

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

export interface UpdateOrderServiceStatusPayload {
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
}

// ADR-0018: discounts go with the payment only for an Order that came in
// unpriced; an Order whose discount settled at drop-off must send none.
export interface UpdateOrderPaymentPayload {
  payment_method_id: number;
  campaign_ids: number[];
  voucher_codes: string[];
  discount: string;
}

export type PaymentCharge = InferResponseType<
  (typeof rpc.api.admin.orders)[":id"]["payment-charges"][":chargeId"]["$get"]
>["data"];

export type CreatePaymentChargePayload = Omit<
  UpdateOrderPaymentPayload,
  "payment_method_id"
>;

// A Repair's price, keyed once agreed with the Customer or re-keyed to fix a
// typo while the Order is unpaid (ADR-0018).
export interface SetOrderServicePricePayload {
  price: string;
}

export interface UpdateOrderCourierPayload {
  collected_by: number | null;
}

export interface UpdateOrderDeliveryFeePayload {
  delivery_fee: string;
}

export interface CreateOrderRefundPayload {
  note?: string;
  items: (({ order_service_id: number } | { order_product_id: number }) & {
    reason: OrderRefundReason;
    note?: string;
  })[];
}

export interface CancelOrderPayload {
  items: (({ order_service_id: number } | { order_product_id: number }) & {
    reason: OrderCancelReason;
    note?: string;
  })[];
}

export interface PresignItemPhotoPayload {
  content_type: PhotoContentType;
}

export interface SaveItemPhotoPayload {
  image_path: string;
  note?: string;
}

export interface PresignOrderDropoffPhotoPayload {
  content_type: PhotoContentType;
}

export interface SaveOrderDropoffPhotoPayload {
  image_path: string;
}

export type PresignOrderPickupEventPayload = z.infer<
  typeof POSTOrderPickupEventPresignSchema
>;

export type CreateOrderPickupEventPayload = z.infer<
  typeof POSTOrderPickupEventSchema
>;

export interface PhotoDownloadRef {
  kind: "item" | "dropoff" | "pickup";
  id: number;
}

interface PresignedUpload {
  upload_url: string;
  key: string;
  expires_in_seconds: number;
}

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
  openPaymentCharge: (orderId: number) =>
    [...ordersKeys.detail(orderId), "payment-charge", "open"] as const,
  queues: () => [...ordersKeys.all, "queue"] as const,
  queue: (query?: FetchOrderServiceQueueQuery) =>
    [...ordersKeys.queues(), query ?? {}] as const,
};

const fetchOrdersPage = async (
  query?: FetchOrdersQuery
): Promise<PaginatedData<Order>> => {
  const response = await parseResponse(
    rpc.api.admin.orders.$get({
      query:
        query && Object.keys(query).length > 0
          ? toSearchParams(query)
          : undefined,
    })
  );

  return toPaginated(response);
};

export const fetchOrderDetail = (id: number) =>
  parseSuccessData<OrderDetail>(
    rpc.api.admin.orders[":id"].$get({
      param: { id: String(id) },
    })
  );

export const fetchOrderReceipt = (id: number) =>
  parseSuccessData<OrderReceipt>(
    rpc.api.admin.orders[":id"].receipt.$get({
      param: { id: String(id) },
    })
  );

export const fetchOrderService = (orderId: number, serviceId: number) =>
  parseSuccessData<OrderServiceDetail>(
    rpc.api.admin.orders[":id"].services[":serviceId"].$get({
      param: { id: String(orderId), serviceId: String(serviceId) },
    })
  );

export const fetchPaymentCharge = (orderId: number, chargeId: number) =>
  parseSuccessData<PaymentCharge>(
    rpc.api.admin.orders[":id"]["payment-charges"][":chargeId"].$get({
      param: { id: String(orderId), chargeId: String(chargeId) },
    })
  );

export const fetchOpenPaymentCharge = (orderId: number) =>
  parseSuccessData<PaymentCharge | null>(
    rpc.api.admin.orders[":id"]["payment-charges"].open.$get({
      param: { id: String(orderId) },
    })
  );

const fetchOrderServiceQueuePage = async (
  query?: FetchOrderServiceQueueQuery
): Promise<PaginatedData<QueueItem>> => {
  const response = await parseResponse(
    rpc.api.admin.orders.services.queue.$get({
      query:
        query && Object.keys(query).length > 0 ? toSearchParams(query) : {},
    })
  );

  return toPaginated(response);
};

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
      // An ended charge never changes again; focus need not ask why it closed.
      staleTime: (query) =>
        query.state.data?.status === "pending" ? 0 : Number.POSITIVE_INFINITY,
    }),
  openPaymentCharge: (orderId: number) =>
    queryOptions({
      queryKey: ordersKeys.openPaymentCharge(orderId),
      queryFn: () => fetchOpenPaymentCharge(orderId),
    }),
  queue: (query?: FetchOrderServiceQueueQuery) =>
    infiniteQueryOptions({
      queryKey: ordersKeys.queue(query),
      // A worker who scrolled deep and came back later would refetch every
      // page in turn; dropping it sooner reloads just the first.
      gcTime: 5 * 60 * 1000,
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        fetchOrderServiceQueuePage({ ...query, offset: pageParam }),
      getNextPageParam: (lastPage) => {
        const nextOffset = lastPage.meta.offset + lastPage.meta.limit;
        return nextOffset < lastPage.meta.total ? nextOffset : undefined;
      },
    }),
};

export const createOrder = (payload: CreateOrderPayload) =>
  parseResponse(rpc.api.admin.orders.$post({ json: payload }));

export const lookupQueueTarget = (q: string) =>
  parseSuccessData<OrderLookup>(
    rpc.api.admin.orders.lookup.$get({ query: { q } })
  );

export const updateOrderServiceStatus = (
  orderId: number,
  serviceId: number,
  payload: UpdateOrderServiceStatusPayload
) =>
  parseResponse(
    rpc.api.admin.orders[":id"].services[":serviceId"].status.$patch({
      param: { id: String(orderId), serviceId: String(serviceId) },
      json: payload,
    })
  );

export const updateOrderPayment = (
  orderId: number,
  payload: UpdateOrderPaymentPayload
) =>
  parseResponse(
    rpc.api.admin.orders[":id"].payment.$patch({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const createPaymentCharge = (
  orderId: number,
  payload: CreatePaymentChargePayload
) =>
  parseSuccessData<PaymentCharge>(
    rpc.api.admin.orders[":id"]["payment-charges"].$post({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const cancelPaymentCharge = (orderId: number, chargeId: number) =>
  parseSuccessData<PaymentCharge>(
    rpc.api.admin.orders[":id"]["payment-charges"][":chargeId"].cancel.$post({
      param: { id: String(orderId), chargeId: String(chargeId) },
    })
  );

export const setOrderServicePrice = (
  orderId: number,
  serviceId: number,
  payload: SetOrderServicePricePayload
) =>
  parseResponse(
    rpc.api.admin.orders[":id"].services[":serviceId"].price.$patch({
      param: { id: String(orderId), serviceId: String(serviceId) },
      json: payload,
    })
  );

export const updateOrderCourier = (
  orderId: number,
  payload: UpdateOrderCourierPayload
) =>
  parseResponse(
    rpc.api.admin.orders[":id"].courier.$patch({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const updateOrderDeliveryFee = (
  orderId: number,
  payload: UpdateOrderDeliveryFeePayload
) =>
  parseResponse(
    rpc.api.admin.orders[":id"]["delivery-fee"].$patch({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const createOrderRefund = (
  orderId: number,
  payload: CreateOrderRefundPayload
) =>
  parseResponse(
    rpc.api.admin.orders[":id"].refunds.$post({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const cancelOrder = (orderId: number, payload: CancelOrderPayload) =>
  parseResponse(
    rpc.api.admin.orders[":id"].cancel.$post({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const presignItemPhoto = (
  orderId: number,
  itemId: number,
  payload: PresignItemPhotoPayload
) =>
  parseSuccessData<PresignedUpload>(
    rpc.api.admin.orders[":id"].items[":itemId"].photos.presign.$post({
      param: { id: String(orderId), itemId: String(itemId) },
      json: payload,
    })
  );

export const saveItemPhoto = (
  orderId: number,
  itemId: number,
  payload: SaveItemPhotoPayload
) =>
  parseResponse(
    rpc.api.admin.orders[":id"].items[":itemId"].photos.$post({
      param: { id: String(orderId), itemId: String(itemId) },
      json: payload,
    })
  );

export const deleteItemPhoto = (
  orderId: number,
  itemId: number,
  photoId: number
) =>
  parseResponse(
    rpc.api.admin.orders[":id"].items[":itemId"].photos[":photoId"].$delete({
      param: {
        id: String(orderId),
        itemId: String(itemId),
        photoId: String(photoId),
      },
    })
  );

export const presignOrderDropoffPhoto = (
  orderId: number,
  payload: PresignOrderDropoffPhotoPayload
) =>
  parseSuccessData<PresignedUpload>(
    rpc.api.admin.orders[":id"]["dropoff-photo"].presign.$post({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const saveOrderDropoffPhoto = (
  orderId: number,
  payload: SaveOrderDropoffPhotoPayload
) =>
  parseResponse(
    rpc.api.admin.orders[":id"]["dropoff-photo"].$put({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const presignOrderPickupEvent = (
  orderId: number,
  payload: PresignOrderPickupEventPayload
) =>
  parseSuccessData<PresignedUpload>(
    rpc.api.admin.orders[":id"]["pickup-events"].presign.$post({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const createOrderPickupEvent = (
  orderId: number,
  payload: CreateOrderPickupEventPayload
) =>
  parseResponse(
    rpc.api.admin.orders[":id"]["pickup-events"].$post({
      param: { id: String(orderId) },
      json: payload,
    })
  );

export const createOrderPickupNotice = (orderId: number) =>
  parseResponse(
    rpc.api.admin.orders[":id"]["pickup-notices"].$post({
      param: { id: String(orderId) },
    })
  );

export const createPhotoDownloadUrl = (photo: PhotoDownloadRef) =>
  parseSuccessData<{ url: string }>(
    rpc.api.admin.photos["download-url"].$post({ json: photo })
  );
