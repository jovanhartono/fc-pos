import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import type z from "zod";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException, NotFoundException } from "@/errors";
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
import { findProducts } from "@/modules/products/product.repository";
import { findServices } from "@/modules/services/service.repository";
import type { POSTOrderSchema } from "@/schema";
import type { Store, User } from "@/types/entity";
import { buildPaginationMeta } from "@/utils/pagination";

function formatOrderCode(storeCode: string, dateStr: string, sequence: number) {
  return `#${storeCode}/${dateStr}/${sequence}`;
}

interface ExpandedServiceItem {
  id: number;
  notes?: string;
  color?: string;
  shoe_brand?: string;
  shoe_size?: string;
}

interface ResolvedDiscount {
  discountAmount: number;
  discountSource: "none" | "manual" | "campaign";
}

function expandServices(
  payloadServices: z.infer<typeof POSTOrderSchema>["services"] = []
): ExpandedServiceItem[] {
  return payloadServices.map((item) => ({
    id: item.id,
    notes: item.notes,
    color: item.color,
    shoe_brand: item.shoe_brand,
    shoe_size: item.shoe_size,
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
      item_code: `${code}-S${String(index + 1).padStart(3, "0")}`,
      order_id: orderId,
      service_id: service.id,
      price: service.price,
      notes: item.notes,
      color: item.color,
      shoe_brand: item.shoe_brand,
      shoe_size: item.shoe_size,
      status: "received" as const,
    };
  });
}

async function resolveDiscount({
  tx,
  campaignId,
  grossTotal,
  manualDiscount,
  storeId,
  storeCode,
}: {
  tx: OrderTx;
  campaignId?: number;
  grossTotal: number;
  manualDiscount: number;
  storeId: number;
  storeCode: string;
}): Promise<ResolvedDiscount> {
  if (campaignId === undefined) {
    return {
      discountAmount: manualDiscount,
      discountSource: manualDiscount > 0 ? "manual" : "none",
    };
  }

  const campaign = await tx.query.campaignsTable.findFirst({
    where: (campaign, { eq }) => eq(campaign.id, campaignId),
    with: {
      stores: {
        columns: {
          store_id: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new NotFoundException(`Campaign not found: ${campaignId}`);
  }
  if (!campaign.is_active) {
    throw new BadRequestException("Campaign is not active");
  }

  const now = new Date();
  if (campaign.starts_at && now < campaign.starts_at) {
    throw new BadRequestException("Campaign has not started yet");
  }
  if (campaign.ends_at && now > campaign.ends_at) {
    throw new BadRequestException("Campaign has ended");
  }

  const storeScopes = campaign.stores.map((item) => item.store_id);
  if (storeScopes.length > 0 && !storeScopes.includes(storeId)) {
    throw new BadRequestException(
      `Campaign is not available for store ${storeCode}`
    );
  }

  if (grossTotal < Number(campaign.min_order_total)) {
    throw new BadRequestException(
      "Order total does not meet campaign minimum order value"
    );
  }

  let discountAmount =
    campaign.discount_type === "fixed"
      ? Number(campaign.discount_value)
      : (grossTotal * Number(campaign.discount_value)) / 100;

  if (campaign.max_discount !== null) {
    discountAmount = Math.min(discountAmount, Number(campaign.max_discount));
  }

  return {
    discountAmount,
    discountSource: discountAmount > 0 ? "campaign" : "none",
  };
}

export async function listOrders(query?: GetOrdersQuery) {
  const normalized = normalizeOrderListQuery(query);
  const { items, total } = await findOrders(normalized);

  return {
    items,
    meta: buildPaginationMeta(total, normalized),
  };
}

export async function createOrder(
  user: User,
  store: Store,
  payload: z.infer<typeof POSTOrderSchema>
) {
  const {
    products = [],
    services = [],
    campaign_id,
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

  const missingServices = serviceIds.filter((id) => !serviceMap.has(id));
  if (missingServices.length > 0) {
    throw new NotFoundException(
      `Service not found: ${missingServices.join(", ")}`
    );
  }

  return db.transaction(async (tx) => {
    const dateStr = dayjs().format("DDMMYYYY");
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
      campaign_id,
      paid_amount: "0",
      notes: orderPayload.notes,
      status: expandedServices.length > 0 ? "created" : "completed",
      completed_at: expandedServices.length > 0 ? null : new Date(),
      paid_at: null,
      store_id: store.id,
      created_by: user.id,
      updated_by: user.id,
    });

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
            qty: item.qty,
            notes: item.notes,
          };
        })
      ),
    ]);

    const grossTotal = serviceSubtotal + productSubtotal;
    const { discountAmount, discountSource } = await resolveDiscount({
      tx,
      campaignId: campaign_id,
      grossTotal,
      manualDiscount: Number(orderPayload.discount),
      storeId: store.id,
      storeCode: store.code,
    });

    if (discountAmount > grossTotal) {
      throw new BadRequestException("Order discount cannot exceed order total");
    }

    const netTotal = grossTotal - discountAmount;

    await tx
      .update(ordersTable)
      .set({
        campaign_id,
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
