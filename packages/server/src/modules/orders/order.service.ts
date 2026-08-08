import { eq } from "drizzle-orm";
import type z from "zod";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { claimRedemptions } from "@/modules/campaigns/campaign-redemption.service";
import { resolveOrCreateCustomer } from "@/modules/customers/customer.service";
import {
  findOrders,
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
import { resolveDiscount } from "@/modules/orders/order-discount.service";
import { deriveOrderRefundStatus } from "@/modules/orders/order-refund-status";
import { summarizeOrderFulfillment } from "@/modules/orders/order-status-machine";
import {
  decrementProductStock,
  findProducts,
} from "@/modules/products/product.repository";
import { findServices } from "@/modules/services/service.repository";
import type { POSTOrderSchema } from "@/schema";
import { fixedPriceSubtotal } from "@/schema/fixed-price";
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
  is_estimate?: boolean;
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
    is_estimate: item.is_estimate,
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

interface ServiceLinePricing {
  estimated_price: string | null;
  price: string;
}

// The price seam (ADR-0018). A catalog-priced Service always snapshots the
// catalog row and silently drops anything the browser sent — the POS can
// never set a normal Service's price. A no-list-price Service (Repair) has
// nothing to snapshot: the cashier's number is required, kept as the line
// price, and additionally pinned in estimated_price when it is an Estimate
// rather than firm.
function resolveServiceLinePricing(
  item: ExpandedServiceItem,
  service: DbService
): ServiceLinePricing {
  if (service.price !== null) {
    return { price: service.price, estimated_price: null };
  }

  // Zero is not a quote: price 0 already means deliberately free (a Rework
  // line, ADR-0013), so quoted work must carry a real number.
  if (item.price == null || item.price <= 0) {
    throw new BadRequestException(
      "Service has no list price — a price is required for this line"
    );
  }

  const price = item.price.toString();
  return { price, estimated_price: item.is_estimate ? price : null };
}

type PricedServiceLine = CatalogLine<ExpandedServiceItem, DbService> & {
  pricing: ServiceLinePricing;
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
  return serviceLines.map(({ item, row: service, pricing }, index) => ({
    brand: item.brand,
    item_code: `${code}-S${String(index + 1).padStart(3, "0")}`,
    is_priority: item.is_priority ?? service.is_priority,
    model: item.model,
    order_id: orderId,
    service_id: service.id,
    price: pricing.price,
    estimated_price: pricing.estimated_price,
    cogs_snapshot: service.cogs,
    notes: item.notes,
    color: item.color,
    size: item.size,
    status: "queued" as const,
  }));
}

export async function listOrders(query?: GetOrdersQuery, user?: JWTPayload) {
  const normalized = normalizeOrderListQuery(query);
  let scopedStoreIds: number[] | undefined;

  if (user) {
    const scope = await resolveStoreScope(user, normalized.store_id);

    switch (scope.kind) {
      // A cashier browsing "all orders" still only sees the branches they work
      // at — an open list would leak every branch's takings to any staff.
      case "some":
        scopedStoreIds = scope.storeIds;
        break;
      // A staff account not yet assigned to a branch: nothing, not everything.
      case "none":
        scopedStoreIds = [];
        break;
      // An admin browses every branch, and a named branch is already the
      // store_id filter the query carries.
      case "all":
      case "one":
        break;
      default:
        return unhandledStoreScope(scope);
    }
  }

  const { items, total } = await findOrders(normalized, scopedStoreIds);

  return {
    items,
    meta: buildPaginationMeta(total, normalized),
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
    // Priced before the transaction — a Repair line missing its quote must
    // bounce here, not after a daily order number has been burned.
    pricing: resolveServiceLinePricing(line.item, line.row),
  }));

  // ADR-0018: every Estimate is unconfirmed at intake, and an Order carrying
  // an unconfirmed Estimate cannot be paid — not even at the counter.
  if (
    orderPayload.payment_status === "paid" &&
    serviceLines.some((line) => line.pricing.estimated_price !== null)
  ) {
    throw new BadRequestException(
      "An order with an unconfirmed Estimate cannot be marked paid"
    );
  }

  // ADR-0019: Campaigns run on the fixed-price subtotal. A no-list-price line
  // (Repair) can be re-priced after checkout, so it may neither unlock a
  // Campaign minimum nor count toward the base a discount is computed from.
  const campaignBase = fixedPriceSubtotal([
    ...serviceLines.map(({ row, pricing }) => ({
      has_list_price: row.price !== null,
      subtotal: Number(pricing.price),
    })),
    ...productLines.map(({ item, row: product }) => ({
      has_list_price: true,
      subtotal: Number(product.price) * item.qty,
    })),
  ]);

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
    // No-list-price lines stay out of the discount desk entirely: they are
    // not in the base (campaignBase) and not selectable by a BOGO either.
    const lines = serviceLines
      .filter(({ row }) => row.price !== null)
      .map(({ item, pricing }) => ({
        price: Number(pricing.price),
        service_id: item.id,
      }));

    const { discountAmount, discountSource, campaignRows } =
      await resolveDiscount({
        campaignIds: [...new Set(campaign_ids)],
        voucherCodes: [...new Set(voucher_codes)],
        grossTotal: campaignBase,
        manualDiscount: orderPayload.discount,
        storeId: store.id,
        storeCode: store.code,
        lines,
      });

    // Capped at the fixed-price subtotal, not the gross: a discount leaning
    // on a Repair quote would breach the DB's total >= discount invariant the
    // moment an Estimate is confirmed downward. Equal to the old gross-total
    // cap whenever the cart carries no no-list-price line.
    if (discountAmount > campaignBase) {
      throw new BadRequestException("Order discount cannot exceed order total");
    }

    await claimRedemptions(tx, campaignRows, orderId);

    const netTotal = grossTotal - discountAmount;

    await tx
      .update(ordersTable)
      .set({
        total: grossTotal.toString(),
        discount: discountAmount.toString(),
        discount_source: discountSource,
        paid_amount:
          orderPayload.payment_status === "paid" ? netTotal.toString() : "0",
        paid_at: orderPayload.payment_status === "paid" ? new Date() : null,
        paid_by: orderPayload.payment_status === "paid" ? userId : null,
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
