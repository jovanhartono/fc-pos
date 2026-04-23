import { eq } from "drizzle-orm";
import type z from "zod";
import { db } from "@/db";
import { orderCampaignsTable, ordersTable } from "@/db/schema";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@/errors";
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
import {
  decrementProductStock,
  findProducts,
} from "@/modules/products/product.repository";
import { findServices } from "@/modules/services/service.repository";
import { findUserById } from "@/modules/users/user.repository";
import type { POSTOrderSchema } from "@/schema";
import { stackCampaignDiscounts } from "@/schema/discount";
import type { JWTPayload } from "@/types";
import type { Store } from "@/types/entity";
import { assertStoreAccess, getUserStoreIds } from "@/utils/authorization";
import { jakartaNow } from "@/utils/date";
import { buildPaginationMeta } from "@/utils/pagination";

function formatOrderCode(storeCode: string, dateStr: string, sequence: number) {
  return `#${storeCode}/${dateStr}/${sequence}`;
}

interface ExpandedServiceItem {
  brand?: string;
  model?: string;
  id: number;
  is_priority?: boolean;
  notes?: string;
  color?: string;
  size?: string;
}

interface ResolvedCampaignRow {
  applied_amount: string;
  campaign_id: number;
  discount_type: "fixed" | "percentage";
  discount_value: string;
  max_discount: string | null;
}

interface ResolvedDiscount {
  discountAmount: number;
  discountSource: "none" | "manual" | "campaign";
  campaignRows: ResolvedCampaignRow[];
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

type ValidatedCampaign = Awaited<
  ReturnType<OrderTx["query"]["campaignsTable"]["findFirst"]>
>;

async function loadAndValidateCampaigns({
  tx,
  campaignIds,
  grossTotal,
  storeId,
  storeCode,
}: {
  tx: OrderTx;
  campaignIds: number[];
  grossTotal: number;
  storeId: number;
  storeCode: string;
}) {
  const campaigns = await tx.query.campaignsTable.findMany({
    where: { id: { in: campaignIds } },
    with: {
      stores: { columns: { store_id: true } },
    },
  });

  const campaignsById = new Map(campaigns.map((item) => [item.id, item]));
  const missing = campaignIds.filter((id) => !campaignsById.has(id));
  if (missing.length > 0) {
    throw new NotFoundException(`Campaign not found: ${missing.join(", ")}`);
  }

  const now = new Date();
  for (const campaign of campaigns) {
    assertCampaignUsable(campaign, {
      now,
      grossTotal,
      storeId,
      storeCode,
    });
  }

  return campaigns;
}

function assertCampaignUsable(
  campaign: NonNullable<ValidatedCampaign> & { stores: { store_id: number }[] },
  {
    now,
    grossTotal,
    storeId,
    storeCode,
  }: { now: Date; grossTotal: number; storeId: number; storeCode: string }
) {
  if (!campaign.is_active) {
    throw new BadRequestException(`Campaign ${campaign.code} is not active`);
  }
  if (campaign.starts_at && now < campaign.starts_at) {
    throw new BadRequestException(
      `Campaign ${campaign.code} has not started yet`
    );
  }
  if (campaign.ends_at && now > campaign.ends_at) {
    throw new BadRequestException(`Campaign ${campaign.code} has ended`);
  }

  const storeScopes = campaign.stores.map((item) => item.store_id);
  if (storeScopes.length > 0 && !storeScopes.includes(storeId)) {
    throw new BadRequestException(
      `Campaign ${campaign.code} is not available for store ${storeCode}`
    );
  }

  if (grossTotal < Number(campaign.min_order_total)) {
    throw new BadRequestException(
      `Order total does not meet minimum for campaign ${campaign.code}`
    );
  }
}

async function resolveDiscount({
  tx,
  campaignIds,
  grossTotal,
  manualDiscount,
  storeId,
  storeCode,
}: {
  tx: OrderTx;
  campaignIds: number[];
  grossTotal: number;
  manualDiscount: number;
  storeId: number;
  storeCode: string;
}): Promise<ResolvedDiscount> {
  const manual = Math.max(0, manualDiscount);

  if (campaignIds.length === 0) {
    return {
      discountAmount: manual,
      discountSource: manual > 0 ? "manual" : "none",
      campaignRows: [],
    };
  }

  const campaigns = await loadAndValidateCampaigns({
    tx,
    campaignIds,
    grossTotal,
    storeId,
    storeCode,
  });

  const { total: campaignDiscount, breakdown } = stackCampaignDiscounts(
    grossTotal,
    campaigns
  );

  const campaignRows: ResolvedCampaignRow[] = breakdown.map(
    ({ campaign, amount }) => ({
      applied_amount: amount.toString(),
      campaign_id: campaign.id,
      discount_type: campaign.discount_type,
      discount_value: campaign.discount_value,
      max_discount: campaign.max_discount,
    })
  );

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
    if (normalized.store_id !== undefined) {
      await assertStoreAccess(user, normalized.store_id);
    } else {
      scopedStoreIds = await getUserStoreIds(user.id);
    }
  }

  const { items, total } = await findOrders(normalized, scopedStoreIds);

  return {
    items,
    meta: buildPaginationMeta(total, normalized),
  };
}

export async function createOrder(
  userId: number,
  store: Store,
  payload: z.infer<typeof POSTOrderSchema>
) {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotFoundException("User not found");
  }
  if (!user.is_active) {
    throw new ForbiddenException("User is not active");
  }

  const {
    products = [],
    services = [],
    campaign_ids = [],
    ...orderPayload
  } = payload;

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

    const orderId = await insertOrder(tx, {
      code,
      customer_id: orderPayload.customer_id,
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
      created_by: userId,
      updated_by: userId,
    });

    for (const item of products) {
      const [decremented] = await decrementProductStock(tx, item.id, item.qty);
      if (!decremented) {
        const product = productMap.get(item.id);
        throw new BadRequestException(
          `Insufficient stock for product ${product?.name ?? item.id}`
        );
      }
    }

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
            notes: item.notes,
          };
        })
      ),
    ]);

    const grossTotal = serviceSubtotal + productSubtotal;
    const { discountAmount, discountSource, campaignRows } =
      await resolveDiscount({
        tx,
        campaignIds: [...new Set(campaign_ids)],
        grossTotal,
        manualDiscount: Number(orderPayload.discount),
        storeId: store.id,
        storeCode: store.code,
      });

    if (discountAmount > grossTotal) {
      throw new BadRequestException("Order discount cannot exceed order total");
    }

    if (campaignRows.length > 0) {
      await tx.insert(orderCampaignsTable).values(
        campaignRows.map((row) => ({
          order_id: orderId,
          campaign_id: row.campaign_id,
          discount_type: row.discount_type,
          discount_value: row.discount_value,
          max_discount: row.max_discount,
          applied_amount: row.applied_amount,
        }))
      );
    }

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
