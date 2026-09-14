import { eq } from "drizzle-orm";
import type z from "zod";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { resolveOrCreateCustomer } from "@/modules/customers/customer.service";
import {
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
import { findOrderDetail } from "@/modules/orders/order-read.repository";
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
import type { JWTPayload } from "@/types";
import type { Store } from "@/types/entity";
import { resolveStoreScope, unhandledStoreScope } from "@/utils/authorization";
import { jakartaNow } from "@/utils/date";
import { buildPaginationMeta } from "@/utils/pagination";
import { buildMediaUrl } from "@/utils/s3";

function formatOrderCode(storeCode: string, dateStr: string, sequence: number) {
  return `#${storeCode}/${dateStr}/${sequence}`;
}

// One treatment, plus which object on the counter it was sold against.
// `item_index` points into the Items array of the same payload — the objects
// have no ids yet, so position is the only handle until they are inserted.
interface ExpandedServiceItem {
  id: number;
  is_priority?: boolean;
  item_index: number;
  notes?: string;
  price?: number;
}

// Only the flattening is real work: the payload's Items already carry exactly
// the descriptors buildItemRows needs, so they travel as-is.
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

// A POS tab stays open for hours and the POS only hides retired items on screen, so
// the basket is matched against the live catalog here — before the transaction,
// so a doomed order never burns a daily order number.
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

// The price seam (ADR-0018). A catalog-priced Service always snapshots the
// catalog row and silently drops anything the browser sent — the POS can
// never set a normal Service's price. A no-list-price Service (Repair) has
// nothing to snapshot: the cashier's number is kept when the price is already
// agreed at drop-off, and the line stays blank (NULL) when the workshop still
// has to inspect the Item — the price is keyed later and payment waits on it.
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

// The tag is minted per object, not per treatment: a pair in for a deep clean,
// a repaint and leather care carries one code, not three (ADR-0017).
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
    // I for Item, the unit of work since ADR-0017. Tags minted before that
    // carry -S and stay valid: nothing parses the suffix — every lookup
    // matches the stored string.
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

// As the repository wants it: undefined means "do not narrow further", [] means
// nothing at all. Confusing the two shows one account every branch's orders.
async function resolveOrderScopedStoreIds(user: JWTPayload, storeId?: number) {
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

export async function listOrders(query?: GetOrdersQuery, user?: JWTPayload) {
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

// Two lines of the same SKU on one tab are two bottles off the shelf, so the
// quantities are summed per product before the shelf is asked — otherwise the
// last bottle sells twice.
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
    // Priced before the transaction — a keyed zero on a Repair line must
    // bounce here, not after a daily order number has been burned.
    price: resolveServiceLinePrice(line.item, line.row),
  }));

  // The settlement desk's view of the basket: the line's own number beside the
  // catalog's, which is what says whether a blank is a Repair awaiting
  // inspection and whether the line could ever be a BOGO free slot.
  const settlementLines: SettlementLine[] = serviceLines.map(
    ({ item, row: service, price }) => ({
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

    // Objects before treatments: a treatment row cannot exist until the object
    // it is applied to has an id to point at.
    const itemRows = buildItemRows({ code, items, orderId });
    const insertedItems = await insertItems(tx, itemRows);
    const itemIdByCode = new Map(
      insertedItems.map((row) => [row.item_code, row.id])
    );
    // Positional again from here, but the positions come from a join on the
    // unique tag rather than from RETURNING's row order.
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

    // ADR-0018: the discount desk runs once every line is priced — the gate
    // above — whether or not the tender arrives now. An Order still carrying a
    // blank line asked for nothing and settles nothing here; its slip rides
    // along to the payment desk.
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

    // Money leaves as a string here to match every order read, so the POS
    // reads one shape whether it just made the order or fetched it back.
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
    ...detailWithoutInternals
  } = detail;

  const items = detail.items.map((item) => {
    const images = item.images.map(({ image_path, ...image }) => ({
      ...image,
      image_url: buildMediaUrl(image_path),
    }));
    const services = item.services.map((service) => ({
      ...service,
      // Stated by the server like is_collectable below: the same rule the
      // queued → processing gate runs (ADR-0019), so the UI can explain the
      // gate early without owning a copy of it.
      has_start_photo: hasStartPhoto(
        item.images,
        service.reworkOf?.created_at ?? null
      ),
    }));

    // Derived on read, never stored — an Item has no status column to drift
    // out of step with its treatments (ADR-0017). `is_collectable` is sent
    // rather than left to the client because the rule is the server's to
    // state: an object goes home when every live treatment on it is ready,
    // and also when there is no live treatment left because the counter
    // refunded it before anyone came back for the pair.
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
    items,
    // Item statuses, not treatment rows: the strip's "n of M picked up" counts
    // objects handed back (ADR-0017).
    fulfillment: summarizeOrderFulfillment(items.map((item) => item.status)),
  };
}
