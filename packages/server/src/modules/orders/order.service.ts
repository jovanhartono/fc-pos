import { eq } from "drizzle-orm";
import type z from "zod";
import { db } from "@/db";
import { orderCampaignsTable, ordersTable } from "@/db/schema";
import { BadRequestException, NotFoundException } from "@/errors";
import {
  atomicClaimCampaignCode,
  atomicIncrementCampaignRedeemed,
} from "@/modules/campaigns/campaign.repository";
import {
  getUsableCampaigns,
  resolveVoucherCode,
} from "@/modules/campaigns/campaign.service";
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
import { deriveOrderRefundStatus } from "@/modules/orders/order-refund-status";
import { summarizeOrderFulfillment } from "@/modules/orders/order-status-machine";
import {
  decrementProductStock,
  findProducts,
} from "@/modules/products/product.repository";
import { findServices } from "@/modules/services/service.repository";
import type { POSTOrderSchema } from "@/schema";
import { stackCampaignDiscounts } from "@/schema/discount";
import type { JWTPayload } from "@/types";
import type { Store } from "@/types/entity";
import { assertStoreAccess, getUserStoreIds } from "@/utils/authorization";
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
  size?: string;
}

interface ResolvedCampaignRow {
  // internal transport only; never returned from createOrder
  _voucherCode?: string;
  applied_amount: string;
  buy_quantity: number | null;
  campaign_id: number;
  discount_type: "fixed" | "percentage" | "buy_n_get_m_free";
  discount_value: string;
  free_quantity: number | null;
  max_discount: string | null;
}

interface ResolvedDiscount {
  campaignRows: ResolvedCampaignRow[];
  discountAmount: number;
  discountSource: "none" | "manual" | "campaign";
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
    size: item.size,
  }));
}

type DbService = Awaited<ReturnType<typeof findServices>>[number];

type DbProduct = Awaited<ReturnType<typeof findProducts>>[number];

type OrderProductInput = NonNullable<
  z.infer<typeof POSTOrderSchema>["products"]
>[number];

function buildOrderServiceRows({
  code,
  expandedServices,
  orderId,
  serviceMap,
}: {
  code: string;
  expandedServices: ExpandedServiceItem[];
  orderId: number;
  serviceMap: Map<number, DbService>;
}) {
  return expandedServices.map((item, index) => {
    const service = serviceMap.get(item.id);
    if (!service) {
      throw new NotFoundException(`Service not found: ${item.id}`);
    }

    return {
      brand: item.brand,
      item_code: `${code}-S${String(index + 1).padStart(3, "0")}`,
      is_priority: item.is_priority ?? service.is_priority,
      model: item.model,
      order_id: orderId,
      service_id: service.id,
      price: service.price,
      cogs_snapshot: service.cogs,
      notes: item.notes,
      color: item.color,
      size: item.size,
      status: "queued" as const,
    };
  });
}

async function resolveDiscount({
  campaignIds,
  voucherCodes,
  grossTotal,
  manualDiscount,
  storeId,
  storeCode,
  lines,
}: {
  campaignIds: number[];
  voucherCodes: string[];
  grossTotal: number;
  manualDiscount: number;
  storeId: number;
  storeCode: string;
  lines: { price: number; service_id: number }[];
}): Promise<ResolvedDiscount> {
  const manual = Math.max(0, manualDiscount);

  if (campaignIds.length === 0 && voucherCodes.length === 0) {
    return {
      discountAmount: manual,
      discountSource: manual > 0 ? "manual" : "none",
      campaignRows: [],
    };
  }

  const campaigns =
    campaignIds.length > 0
      ? await getUsableCampaigns({
          campaignIds,
          grossTotal,
          storeId,
          storeCode,
        })
      : [];

  // Resolve vouchers — each call validates eligibility and returns the campaign
  // shaped like a listCampaigns item (nested eligibleServices) and carrying an
  // internal _voucherCode marker used to claim the code inside the tx.
  const voucherCampaigns = await Promise.all(
    voucherCodes.map((code) =>
      resolveVoucherCode(code, { storeId, storeCode, grossTotal })
    )
  );

  // order_campaigns is unique on (order_id, campaign_id): a campaign may apply at
  // most once per order. Two voucher codes from the same campaign — or a voucher
  // whose campaign is also listed — would otherwise collide on the DB constraint
  // mid-checkout (and clobber the claimed code_id). Reject up front instead.
  const allCampaignIds = [
    ...campaigns.map((campaign) => campaign.id),
    ...voucherCampaigns.map((campaign) => campaign.id),
  ];
  const duplicateId = allCampaignIds.find(
    (id, index) => allCampaignIds.indexOf(id) !== index
  );
  if (duplicateId !== undefined) {
    throw new BadRequestException(
      "A campaign can only be applied once per order"
    );
  }

  // Normalize both sources to the flat stackCampaignDiscounts input shape.
  // Listed campaigns already expose eligible_service_ids; vouchers expose the
  // nested eligibleServices -> service_id, which we flatten here.
  const stackInput = [
    ...campaigns.map((campaign) => ({
      ...campaign,
      _voucherCode: undefined as string | undefined,
    })),
    ...voucherCampaigns.map((campaign) => ({
      ...campaign,
      eligible_service_ids: campaign.eligibleServices.map(
        (entry) => entry.service_id
      ),
    })),
  ];

  const { total: campaignDiscount, breakdown } = stackCampaignDiscounts(
    grossTotal,
    stackInput,
    lines
  );

  // Only campaigns that actually contributed a discount are claimed and logged.
  // stackCampaignDiscounts emits a zero-amount entry for every campaign it could
  // not apply (a voucher stacked after the order total was already fully
  // discounted, or a BOGO with no eligible line). Redeeming those would burn a
  // single-use bearer code or a usage-limit slot for no benefit.
  const campaignRows: ResolvedCampaignRow[] = breakdown
    .filter(({ amount }) => amount > 0)
    .map(({ campaign, amount }) => ({
      applied_amount: amount.toString(),
      campaign_id: campaign.id,
      _voucherCode: campaign._voucherCode,
      discount_type: campaign.discount_type,
      discount_value: campaign.discount_value,
      max_discount: campaign.max_discount,
      buy_quantity: campaign.buy_quantity,
      free_quantity: campaign.free_quantity,
    }));

  const afterCampaign = Math.max(0, grossTotal - campaignDiscount);
  const appliedManual = Math.min(manual, afterCampaign);
  const totalDiscount = campaignDiscount + appliedManual;

  let discountSource: ResolvedDiscount["discountSource"] = "none";
  if (campaignDiscount > 0) {
    discountSource = "campaign";
  } else if (manual > 0) {
    discountSource = "manual";
  }

  return {
    discountAmount: totalDiscount,
    discountSource,
    campaignRows,
  };
}

export async function listOrders(query?: GetOrdersQuery, user?: JWTPayload) {
  const normalized = normalizeOrderListQuery(query);
  let scopedStoreIds: number[] | undefined;

  if (user && user.role !== "admin") {
    if (normalized.store_id === undefined) {
      scopedStoreIds = await getUserStoreIds(user.id);
    } else {
      await assertStoreAccess(user, normalized.store_id);
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
  products: OrderProductInput[],
  productMap: Map<number, DbProduct>
) {
  for (const item of products) {
    const [decremented] = await decrementProductStock(tx, item.id, item.qty);
    if (!decremented) {
      const product = productMap.get(item.id);
      throw new BadRequestException(
        `Insufficient stock for product ${product?.name ?? item.id}`
      );
    }
  }
}

// Claim each resolved campaign inside the order transaction (ADR-0015): a
// voucher row atomically claims its single-use code; a listed row does a
// conditional increment that also passes for uncapped campaigns. Then log the
// applied rows on the order.
async function applyCampaignRedemptions(
  tx: OrderTx,
  campaignRows: ResolvedCampaignRow[],
  orderId: number
) {
  if (campaignRows.length === 0) {
    return;
  }

  const resolvedCodeIds = new Map<number, number>(); // campaignId -> codeId

  for (const row of campaignRows) {
    if (row._voucherCode === undefined) {
      // Listed: atomic conditional increment (uncapped campaigns pass too).
      const claimed = await atomicIncrementCampaignRedeemed(
        tx,
        row.campaign_id
      );
      if (!claimed) {
        throw new BadRequestException(
          `Campaign ${row.campaign_id} has reached its usage limit`
        );
      }
    } else {
      // Voucher: atomic single-use claim of the specific code.
      const claimed = await atomicClaimCampaignCode(
        tx,
        row._voucherCode,
        orderId
      );
      if (!claimed) {
        throw new BadRequestException(
          `Voucher code ${row._voucherCode} has already been redeemed`
        );
      }
      resolvedCodeIds.set(row.campaign_id, claimed.codeId);
    }
  }

  await tx.insert(orderCampaignsTable).values(
    campaignRows.map((row) => ({
      order_id: orderId,
      campaign_id: row.campaign_id,
      code_id: resolvedCodeIds.get(row.campaign_id) ?? null,
      discount_type: row.discount_type,
      discount_value: row.discount_value,
      max_discount: row.max_discount,
      applied_amount: row.applied_amount,
      buy_quantity: row.buy_quantity,
      free_quantity: row.free_quantity,
    }))
  );
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

  const productMap = new Map(
    dbProducts.map((product) => [product.id, product])
  );
  const serviceMap = new Map(
    dbServices.map((service) => [service.id, service])
  );

  const missingProducts = productIds.filter((id) => !productMap.has(id));
  if (missingProducts.length > 0) {
    throw new NotFoundException(
      `Product not found: ${missingProducts.join(", ")}`
    );
  }

  const inactiveProducts = productIds.filter(
    (id) => !productMap.get(id)?.is_active
  );
  if (inactiveProducts.length > 0) {
    throw new BadRequestException(
      `Product is not active: ${inactiveProducts.join(", ")}`
    );
  }

  const missingServices = serviceIds.filter((id) => !serviceMap.has(id));
  if (missingServices.length > 0) {
    throw new NotFoundException(
      `Service not found: ${missingServices.join(", ")}`
    );
  }

  return db.transaction(async (tx) => {
    const dateStr = jakartaNow().format("DDMMYYYY");
    const sequence = await reserveNextOrderNumber(tx, store.code, dateStr);
    const code = formatOrderCode(store.code, dateStr, sequence);
    const expandedServices = expandServices(services);

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
      status: expandedServices.length > 0 ? "created" : "completed",
      completed_at: expandedServices.length > 0 ? null : new Date(),
      paid_at: null,
      store_id: store.id,
      collected_by: orderPayload.collected_by ?? null,
      created_by: userId,
      updated_by: userId,
    });

    await decrementProductsStock(tx, products, productMap);

    const [serviceSubtotal, productSubtotal] = await Promise.all([
      insertOrderServices(
        tx,
        buildOrderServiceRows({
          code,
          expandedServices,
          orderId,
          serviceMap,
        })
      ),
      insertOrderProducts(
        tx,
        products.map((item) => {
          const product = productMap.get(item.id);
          if (!product) {
            throw new NotFoundException(`Product not found: ${item.id}`);
          }

          return {
            order_id: orderId,
            product_id: product.id,
            price: product.price,
            cogs_snapshot: (Number(product.cogs) * item.qty).toFixed(2),
            qty: item.qty,
          };
        })
      ),
    ]);

    const grossTotal = serviceSubtotal + productSubtotal;
    const lines = expandedServices.map((item) => {
      const service = serviceMap.get(item.id);
      return {
        price: Number(service?.price ?? 0),
        service_id: item.id,
      };
    });

    const { discountAmount, discountSource, campaignRows } =
      await resolveDiscount({
        campaignIds: [...new Set(campaign_ids)],
        voucherCodes: [...new Set(voucher_codes)],
        grossTotal,
        manualDiscount: Number(orderPayload.discount),
        storeId: store.id,
        storeCode: store.code,
        lines,
      });

    if (discountAmount > grossTotal) {
      throw new BadRequestException("Order discount cannot exceed order total");
    }

    await applyCampaignRedemptions(tx, campaignRows, orderId);

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

    return {
      code,
      id: orderId,
      total: grossTotal,
      total_after_discount: netTotal,
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
          handlerLogs: {
            with: {
              changedBy: {
                columns: {
                  id: true,
                  name: true,
                },
              },
              fromHandler: {
                columns: {
                  id: true,
                  name: true,
                },
              },
              toHandler: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { id: "asc" },
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
            orderBy: { id: "asc" },
          },
          reworkOf: {
            columns: { id: true },
          },
          refundItems: true,
          service: true,
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

  const { pickup_code: _pickup_code, ...detailWithoutPickupCode } = detail;

  return {
    ...detailWithoutPickupCode,
    dropoff_photo_url: buildMediaUrl(detail.dropoff_photo_path),
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
      images: service.images.map((image) => ({
        ...image,
        image_url: buildMediaUrl(image.image_path),
      })),
    })),
    fulfillment: summarizeOrderFulfillment(
      detail.services.map((service) => service.status)
    ),
  };
}
