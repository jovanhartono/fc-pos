import { eq } from "drizzle-orm";
import type z from "zod";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { resolveOrCreateCustomer } from "@/modules/customers/customer.service";
import {
  countOrdersByStatus,
  findOrders,
  insertItems,
  insertOrder,
  insertOrderProducts,
  insertOrderServices,
  type OrderTx,
  reserveNextOrderNumber,
} from "@/modules/orders/order.repository";
import {
  type GetOrdersQuery,
  normalizeOrderListQuery,
} from "@/modules/orders/order.schema";
import { assertActiveCourier } from "@/modules/orders/order-courier.service";
import { hasStartPhoto } from "@/modules/orders/order-photo-gate.repository";
import {
  findOrderDetail,
  toLastPickupNotice,
  withReworkOpenings,
} from "@/modules/orders/order-read.repository";
import { deriveOrderRefundStatus } from "@/modules/orders/order-refund-status";
import {
  assertDiscountRequestAllowed,
  assertLinePrice,
  assertPayable,
  type SettlementLine,
  settleDiscount,
} from "@/modules/orders/order-settlement.service";
import {
  deriveItemStatus,
  isCollectableItemStatus,
  summarizeOrderFulfillment,
} from "@/modules/orders/order-status-machine";
import {
  decrementProductsStock,
  findProducts,
} from "@/modules/products/product.repository";
import { findServices } from "@/modules/services/service.repository";
import type { POSTOrderSchema } from "@/schema";
import type { AuthUser } from "@/types";
import type { Store } from "@/types/entity";
import { resolveStoreScope, unhandledStoreScope } from "@/utils/authorization";
import { jakartaNow } from "@/utils/date";
import { buildPaginationMeta } from "@/utils/pagination";
import { buildMediaUrl } from "@/utils/s3";

function formatOrderCode(storeCode: string, dateStr: string, sequence: number) {
  return `#${storeCode}/${dateStr}/${sequence}`;
}

// `item_index` points into the payload's Items array: they have no ids until
// inserted, so position is the only handle.
interface ExpandedServiceItem {
  id: number;
  is_priority?: boolean;
  item_index: number;
  notes?: string;
  price?: number;
}

function expandOrderServices(
  payloadItems: z.infer<typeof POSTOrderSchema>["items"] = []
): ExpandedServiceItem[] {
  return payloadItems.flatMap((item, item_index) =>
    item.services.map((service) => ({
      id: service.id,
      is_priority: service.is_priority,
      item_index,
      notes: service.notes,
      price: service.price,
    }))
  );
}

type DbService = Awaited<ReturnType<typeof findServices>>[number];

type DbProduct = Awaited<ReturnType<typeof findProducts>>[number];

type OrderProductInput = NonNullable<
  z.infer<typeof POSTOrderSchema>["products"]
>[number];

interface CatalogLine<TItem, TRow> {
  item: TItem;
  row: TRow;
}

// The POS stays open for hours and only hides retired catalog entries on screen,
// so the Cart is checked against the live catalog here, before a daily Order
// number is used up.
function resolveCatalogLines<
  TItem extends { id: number },
  TRow extends { id: number; is_active: boolean },
>(label: string, items: TItem[], rows: TRow[]): CatalogLine<TItem, TRow>[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const missing = new Set<number>();
  const inactive = new Set<number>();
  const lines: CatalogLine<TItem, TRow>[] = [];

  for (const item of items) {
    const row = rowsById.get(item.id);

    if (!row) {
      missing.add(item.id);
    } else if (row.is_active) {
      lines.push({ item, row });
    } else {
      inactive.add(item.id);
    }
  }

  if (missing.size > 0) {
    throw new NotFoundException(
      `${label} not found: ${[...missing].join(", ")}`
    );
  }

  if (inactive.size > 0) {
    throw new BadRequestException(
      `${label} is not active: ${[...inactive].join(", ")}`
    );
  }

  return lines;
}

// ADR-0018: a catalog-priced Service always takes the catalog price, whatever the
// POS sent. A Repair keeps the cashier's agreed price, or stays blank until the
// workshop inspects the Item, and payment waits on it.
function resolveServiceLinePrice(
  item: ExpandedServiceItem,
  service: DbService
): string | null {
  if (service.price !== null) {
    return service.price;
  }

  if (item.price == null) {
    return null;
  }

  assertLinePrice(item.price);

  return item.price.toString();
}

type PricedServiceLine = CatalogLine<ExpandedServiceItem, DbService> & {
  price: string | null;
};

// One Item code per Item, not per line: a pair in for a clean and a repaint
// carries one code (ADR-0017).
function buildItemRows({
  code,
  items,
  orderId,
}: {
  code: string;
  items: NonNullable<z.infer<typeof POSTOrderSchema>["items"]>;
  orderId: number;
}) {
  return items.map((item, index) => ({
    brand: item.brand,
    color: item.color,
    // Tags printed before ADR-0017 end in -S and still work: lookups match the
    // stored string, nothing parses the suffix.
    item_code: `${code}-I${String(index + 1).padStart(3, "0")}`,
    model: item.model,
    order_id: orderId,
    size: item.size,
  }));
}

function buildOrderServiceRows({
  itemIds,
  orderId,
  serviceLines,
}: {
  itemIds: number[];
  orderId: number;
  serviceLines: PricedServiceLine[];
}) {
  return serviceLines.map(({ item, row: service, price }) => ({
    is_priority: item.is_priority ?? service.is_priority,
    item_id: itemIds[item.item_index],
    order_id: orderId,
    service_id: service.id,
    price,
    cogs_snapshot: service.cogs,
    notes: item.notes,
    status: "queued" as const,
  }));
}

// undefined means "do not narrow further", [] means nothing at all. Mixing them
// up shows one account every Store's Orders.
async function resolveOrderScopedStoreIds(user: AuthUser, storeId?: number) {
  const scope = await resolveStoreScope(user, storeId);

  switch (scope.kind) {
    case "some":
      return scope.storeIds;
    case "none":
      return [];
    case "all":
    case "one":
      return;
    default:
      return unhandledStoreScope(scope);
  }
}

export async function getOrderStatusCounts(
  query: GetOrdersQuery,
  user: AuthUser
) {
  const normalized = normalizeOrderListQuery(query);
  const scopedStoreIds = await resolveOrderScopedStoreIds(
    user,
    normalized.store_id
  );
  return countOrdersByStatus(normalized, scopedStoreIds);
}

export async function listOrders(query?: GetOrdersQuery, user?: AuthUser) {
  const normalized = normalizeOrderListQuery(query);
  const scopedStoreIds = user
    ? await resolveOrderScopedStoreIds(user, normalized.store_id)
    : undefined;

  const { items, total } = await findOrders(normalized, scopedStoreIds);

  return {
    items,
    meta: buildPaginationMeta(total, normalized),
  };
}

// Two lines of the same Product are summed before stock is checked, or the last
// bottle sells twice.
async function reserveBasketStock(
  tx: OrderTx,
  productLines: CatalogLine<OrderProductInput, DbProduct>[]
) {
  const qtyByProductId = new Map<number, number>();
  for (const { item, row: product } of productLines) {
    qtyByProductId.set(
      product.id,
      (qtyByProductId.get(product.id) ?? 0) + item.qty
    );
  }

  if (qtyByProductId.size === 0) {
    return;
  }

  const taken = await decrementProductsStock(
    tx,
    [...qtyByProductId].map(([productId, qty]) => ({ productId, qty }))
  );
  const takenIds = new Set(taken.map((row) => row.id));

  const short = productLines.find(({ row }) => !takenIds.has(row.id));
  if (short) {
    throw new BadRequestException(
      `Insufficient stock for product ${short.row.name}`
    );
  }
}

export async function createOrder(
  userId: number,
  store: Store,
  payload: z.infer<typeof POSTOrderSchema>
) {
  const {
    products = [],
    items = [],
    campaign_ids = [],
    voucher_codes = [],
    ...orderPayload
  } = payload;

  const isPaidAtDropoff = orderPayload.payment_status === "paid";

  if (orderPayload.collected_by != null) {
    await assertActiveCourier(orderPayload.collected_by);
  }

  const services = expandOrderServices(items);

  const productIds = [...new Set(products.map((item) => item.id))];
  const serviceIds = [...new Set(services.map((item) => item.id))];

  const [dbProducts, dbServices] = await Promise.all([
    productIds.length > 0 ? findProducts(productIds) : Promise.resolve([]),
    serviceIds.length > 0 ? findServices(serviceIds) : Promise.resolve([]),
  ]);

  const productLines = resolveCatalogLines("Product", products, dbProducts);
  const serviceLines: PricedServiceLine[] = resolveCatalogLines(
    "Service",
    services,
    dbServices
  ).map((line) => ({
    ...line,
    // A zero typed on a Repair line must be refused before a daily Order number
    // is used up.
    price: resolveServiceLinePrice(line.item, line.row),
  }));

  // The line's price beside the catalog's tells a Repair awaiting inspection
  // apart, and whether the line could be a BOGO free slot.
  const settlementLines: SettlementLine[] = serviceLines.map(
    ({ item, row: service, price }) => ({
      complaint_id: null,
      price,
      service: { price: service.price },
      service_id: item.id,
      status: "queued",
    })
  );

  const discountRequest = {
    campaign_ids,
    discount: orderPayload.discount,
    voucher_codes,
  };

  if (isPaidAtDropoff) {
    assertPayable(settlementLines);
  }
  assertDiscountRequestAllowed({
    hasBlankLine: settlementLines.some((line) => line.price === null),
    isSettled: false,
    request: discountRequest,
  });

  return db.transaction(async (tx) => {
    const dateStr = jakartaNow().format("DDMMYYYY");
    const sequence = await reserveNextOrderNumber(tx, store.code, dateStr);
    const code = formatOrderCode(store.code, dateStr, sequence);

    const customerId = await resolveOrCreateCustomer({
      executor: tx,
      actorId: userId,
      name: orderPayload.customer.name,
      phone_number: orderPayload.customer.phone_number,
      origin_store_id: store.id,
    });

    const orderId = await insertOrder(tx, {
      code,
      customer_id: customerId,
      payment_method_id: orderPayload.payment_method_id,
      payment_status: orderPayload.payment_status,
      discount: "0",
      discount_source: "none",
      paid_amount: "0",
      notes: orderPayload.notes,
      status: serviceLines.length > 0 ? "created" : "completed",
      completed_at: serviceLines.length > 0 ? null : new Date(),
      paid_at: null,
      store_id: store.id,
      collected_by: orderPayload.collected_by ?? null,
      created_by: userId,
      updated_by: userId,
    });

    await reserveBasketStock(tx, productLines);

    const itemRows = buildItemRows({ code, items, orderId });
    const insertedItems = await insertItems(tx, itemRows);
    const itemIdByCode = new Map(
      insertedItems.map((row) => [row.item_code, row.id])
    );
    // Matched by Item code, not by the order rows come back in.
    const itemIds = itemRows.map((row) => {
      const id = itemIdByCode.get(row.item_code);
      if (id === undefined) {
        throw new Error(`Item ${row.item_code} was not inserted`);
      }
      return id;
    });

    const [serviceSubtotal, productSubtotal] = await Promise.all([
      insertOrderServices(
        tx,
        buildOrderServiceRows({
          itemIds,
          orderId,
          serviceLines,
        })
      ),
      insertOrderProducts(
        tx,
        productLines.map(({ item, row: product }) => ({
          order_id: orderId,
          product_id: product.id,
          price: product.price,
          // COGS is stored in whole rupiah, like every amount at the counter.
          cogs_snapshot: Math.round(Number(product.cogs) * item.qty).toString(),
          qty: item.qty,
        }))
      ),
    ]);

    const grossTotal = serviceSubtotal + productSubtotal;

    // ADR-0018: discounts settle once every line is priced, paid now or not. An
    // Order with a blank line settles nothing here; that waits for payment.
    const { discountAmount, discountSource } = await settleDiscount(tx, {
      grossTotal,
      lines: settlementLines,
      orderId,
      request: discountRequest,
      storeCode: store.code,
      storeId: store.id,
    });

    const netTotal = grossTotal - discountAmount;

    await tx
      .update(ordersTable)
      .set({
        total: grossTotal.toString(),
        discount: discountAmount.toString(),
        discount_source: discountSource,
        paid_amount: isPaidAtDropoff ? netTotal.toString() : "0",
        paid_at: isPaidAtDropoff ? new Date() : null,
        paid_by: isPaidAtDropoff ? userId : null,
      })
      .where(eq(ordersTable.id, orderId));

    // Strings, like every Order read, so the POS sees one shape.
    return {
      code,
      id: orderId,
      total: grossTotal.toString(),
      total_after_discount: netTotal.toString(),
    };
  });
}

export async function getOrderDetailById(id: number) {
  const detail = await findOrderDetail(id);

  if (!detail) {
    return null;
  }

  // Photos ship as a URL; the raw bucket keys stay server-side.
  const {
    dropoff_photo_path: dropoffPhotoPath,
    pickup_code: _pickup_code,
    pickupEvents: _pickupEvents,
    pickupNotices,
    ...detailWithoutInternals
  } = detail;

  const items = detail.items.map((item) => {
    const images = item.images.map(({ image_path, ...image }) => ({
      ...image,
      image_url: buildMediaUrl(image_path),
    }));
    const services = item.services.map((service) => {
      const line = { ...service, ...withReworkOpenings(service) };
      return {
        ...line,
        // The same rule the start-work photo check runs (ADR-0019), so the UI
        // can warn early without its own copy.
        has_start_photo: hasStartPhoto(item.images, line),
      };
    });

    // `is_collectable` comes from the server so the client never keeps its own
    // copy of the pickup rule (ADR-0017).
    const status = deriveItemStatus(services);

    return {
      ...item,
      images,
      status,
      is_collectable: isCollectableItemStatus(status),
      services,
    };
  });

  return {
    ...detailWithoutInternals,
    dropoff_photo_url: buildMediaUrl(dropoffPhotoPath),
    refund_status: deriveOrderRefundStatus({
      paid_amount: detail.paid_amount,
      refunded_amount: detail.refunded_amount,
    }),
    pickup_events: detail.pickupEvents.map((event) => ({
      created_at: event.created_at,
      id: event.id,
      image_url: buildMediaUrl(event.image_path),
      picked_up_at: event.picked_up_at,
      picked_up_by: event.pickedUpBy,
    })),
    last_pickup_notice: toLastPickupNotice(pickupNotices),
    items,
    // Item statuses, not lines: "n of M picked up" counts Items (ADR-0017).
    fulfillment: summarizeOrderFulfillment(items.map((item) => item.status)),
  };
}
