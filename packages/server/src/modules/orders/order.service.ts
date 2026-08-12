import { eq } from "drizzle-orm";
import type z from "zod";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { claimRedemptions } from "@/modules/campaigns/campaign-redemption.service";
import { resolveOrCreateCustomer } from "@/modules/customers/customer.service";
import {
  countOrders,
  findOrders,
  insertOrder,
  insertOrderProducts,
  insertOrderServices,
  type OrderTx,
  reserveNextOrderNumber,
} from "@/modules/orders/order.repository";
import {
  type GetOrderCountsQuery,
  type GetOrdersQuery,
  normalizeOrderListQuery,
} from "@/modules/orders/order.schema";
import { assertActiveCourier } from "@/modules/orders/order-courier.service";
import { resolveDiscount } from "@/modules/orders/order-discount.service";
import { deriveOrderRefundStatus } from "@/modules/orders/order-refund-status";
import { summarizeOrderFulfillment } from "@/modules/orders/order-status-machine";
import {
  decrementProductStock,
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

interface ExpandedServiceItem {
  brand?: string;
  color?: string;
  id: number;
  is_priority?: boolean;
  model?: string;
  notes?: string;
  price?: number;
  size?: string;
}

function expandServices(
  payloadServices: z.infer<typeof POSTOrderSchema>["services"] = []
): ExpandedServiceItem[] {
  return payloadServices.map((item) => ({
    brand: item.brand,
    model: item.model,
    id: item.id,
    is_priority: item.is_priority,
    notes: item.notes,
    color: item.color,
    price: item.price,
    size: item.size,
  }));
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

// A till stays open for hours and the POS only hides retired items on screen, so
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

  // Zero is not a price: 0 already means deliberately free (a Rework line,
  // ADR-0013), and "not priced yet" is a blank, not a keyed zero.
  if (item.price <= 0) {
    throw new BadRequestException("Line price must be greater than zero");
  }

  return item.price.toString();
}

type PricedServiceLine = CatalogLine<ExpandedServiceItem, DbService> & {
  price: string | null;
};

function buildOrderServiceRows({
  code,
  orderId,
  serviceLines,
}: {
  code: string;
  orderId: number;
  serviceLines: PricedServiceLine[];
}) {
  return serviceLines.map(({ item, row: service, price }, index) => ({
    brand: item.brand,
    item_code: `${code}-S${String(index + 1).padStart(3, "0")}`,
    is_priority: item.is_priority ?? service.is_priority,
    model: item.model,
    order_id: orderId,
    service_id: service.id,
    price,
    cogs_snapshot: service.cogs,
    notes: item.notes,
    color: item.color,
    size: item.size,
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

export async function getOrderListCounts(
  query: GetOrderCountsQuery,
  user: JWTPayload
) {
  const storeId = query?.store_id;
  const scopedStoreIds = await resolveOrderScopedStoreIds(user, storeId);
  const base = { store_id: storeId };
  const today = jakartaNow().format("YYYY-MM-DD");

  const [all, todayTotal, unpaid, readyForPickup, overdue] = await Promise.all([
    countOrders(base, scopedStoreIds),
    countOrders({ ...base, date_from: today, date_to: today }, scopedStoreIds),
    countOrders({ ...base, payment_status: "unpaid" }, scopedStoreIds),
    countOrders({ ...base, status: "ready_for_pickup" }, scopedStoreIds),
    countOrders({ ...base, overdue: true }, scopedStoreIds),
  ]);

  return {
    all,
    today: todayTotal,
    unpaid,
    ready_for_pickup: readyForPickup,
    overdue,
  };
}

async function decrementProductsStock(
  tx: OrderTx,
  productLines: CatalogLine<OrderProductInput, DbProduct>[]
) {
  for (const { item, row: product } of productLines) {
    const [decremented] = await decrementProductStock(tx, product.id, item.qty);
    if (!decremented) {
      throw new BadRequestException(
        `Insufficient stock for product ${product.name}`
      );
    }
  }
}

export async function createOrder(
  userId: number,
  store: Store,
  payload: z.infer<typeof POSTOrderSchema>
) {
  const {
    products = [],
    services = [],
    campaign_ids = [],
    voucher_codes = [],
    ...orderPayload
  } = payload;

  const isPaidAtDropoff = orderPayload.payment_status === "paid";

  if (orderPayload.collected_by != null) {
    await assertActiveCourier(orderPayload.collected_by);
  }

  const productIds = [...new Set(products.map((item) => item.id))];
  const serviceIds = [...new Set(services.map((item) => item.id))];

  const [dbProducts, dbServices] = await Promise.all([
    productIds.length > 0 ? findProducts(productIds) : Promise.resolve([]),
    serviceIds.length > 0 ? findServices(serviceIds) : Promise.resolve([]),
  ]);

  const productLines = resolveCatalogLines("Product", products, dbProducts);
  const serviceLines: PricedServiceLine[] = resolveCatalogLines(
    "Service",
    expandServices(services),
    dbServices
  ).map((line) => ({
    ...line,
    // Priced before the transaction — a keyed zero on a Repair line must
    // bounce here, not after a daily order number has been burned.
    price: resolveServiceLinePrice(line.item, line.row),
  }));

  // ADR-0018: no price, no payment. A blank line is a Repair the workshop has
  // not inspected yet — its number is not known, so no money moves for the
  // Order, not even for the lines the counter already knows.
  const hasBlankLine = serviceLines.some((line) => line.price === null);
  if (isPaidAtDropoff && hasBlankLine) {
    throw new BadRequestException(
      "Order has an unpriced line — set its price before collecting payment"
    );
  }

  // ADR-0018: a promo settles once every line is priced, not once
  // the money arrives. The customer who sends a driver with the items pays at
  // pickup, and the drop-off Receipt is the only proof they hold — a gross
  // total under a promised discount is a verbal promise in print, and they
  // will not trust it. What must never happen is a promo settled against a
  // guess, so a blank line still bounces: the base is not knowable until the
  // workshop has inspected the Item.
  if (
    hasBlankLine &&
    (campaign_ids.length > 0 ||
      voucher_codes.length > 0 ||
      orderPayload.discount > 0)
  ) {
    throw new BadRequestException(
      "Order has an unpriced line — promotions wait until every item is priced"
    );
  }

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

    await decrementProductsStock(tx, productLines);

    const [serviceSubtotal, productSubtotal] = await Promise.all([
      insertOrderServices(
        tx,
        buildOrderServiceRows({
          code,
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

    // BOGO stays exclusive (ADR-0018): a no-list-price line (Repair) is never
    // selectable as a buy-one-get-one free slot — a misconfigured Campaign
    // must not hand out a repair as a free item. Deliberate owner decision;
    // it keys on the catalog having no list price, not on the line's number.
    const lines = serviceLines
      .filter(({ row }) => row.price !== null)
      .map(({ item, price }) => ({
        price: Number(price),
        service_id: item.id,
      }));

    // ADR-0018: the discount desk runs once every line is priced —
    // the gate above — whether or not the tender arrives now. Attaching is
    // claiming: the voucher code leaves circulation and the usage slot is
    // taken the moment the discount goes on the Receipt, because that Receipt
    // is what the customer will hold the shop to. Printing a promo the shop
    // has not actually reserved is how two customers end up holding the last
    // slot of the same campaign. An Order still carrying a blank line settles
    // nothing here and waits for the payment desk.
    const { discountAmount, discountSource, campaignRows } = hasBlankLine
      ? {
          discountAmount: 0,
          discountSource: "none" as const,
          campaignRows: [],
        }
      : await resolveDiscount({
          campaignIds: campaign_ids,
          voucherCodes: voucher_codes,
          grossTotal,
          manualDiscount: orderPayload.discount,
          storeId: store.id,
          storeCode: store.code,
          lines,
        });

    await claimRedemptions(tx, campaignRows, orderId);

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
  const detail = await db.query.ordersTable.findFirst({
    where: { id },
    with: {
      campaigns: {
        with: {
          campaign: true,
        },
        orderBy: { id: "asc" },
      },
      collectedBy: {
        columns: {
          id: true,
          name: true,
        },
      },
      customer: true,
      paidBy: {
        columns: {
          id: true,
          name: true,
        },
      },
      paymentMethod: true,
      pickupEvents: {
        with: {
          pickedUpBy: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { picked_up_at: "asc" },
      },
      products: {
        with: {
          product: true,
        },
      },
      refunds: {
        with: {
          items: true,
          refundedBy: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
      services: {
        with: {
          handler: {
            columns: {
              id: true,
              name: true,
            },
          },
          images: {
            where: { deleted_at: { isNull: true } },
            orderBy: { id: "asc" },
          },
          // Complaints opened against this line + (if this line is a rework)
          // the complaint that spawned it — see ADR-0013. Existence is the
          // only signal; the complaint carries no status (ADR-0013 amendment).
          complaints: {
            columns: { id: true },
            limit: 1,
            orderBy: { id: "asc" },
          },
          reworkOf: {
            columns: { id: true },
          },
          refundItems: true,
          // Naming the service only — the shop's cost base stays off the wire.
          service: { columns: { id: true, name: true } },
          statusLogs: {
            with: {
              changedBy: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: { id: "asc" },
      },
      store: true,
    },
  });

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
    services: detail.services.map((service) => ({
      ...service,
      images: service.images.map(({ image_path, ...image }) => ({
        ...image,
        image_url: buildMediaUrl(image_path),
      })),
    })),
    fulfillment: summarizeOrderFulfillment(
      detail.services.map((service) => service.status)
    ),
  };
}
