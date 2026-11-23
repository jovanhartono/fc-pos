import { and, EmptyFilter, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import type { DbExecutor } from "@/db";
import {
  campaignCodesTable,
  campaignEligibleServicesTable,
  campaignStoresTable,
  campaignsTable,
  orderCampaignsTable,
} from "@/db/schema";
import type { OrderTx } from "@/modules/orders/order.repository";

interface CampaignFilters {
  is_active?: boolean;
  redemption_mode?: "listed" | "code";
  store_id?: number;
}

type CampaignDiscountType = "fixed" | "percentage" | "buy_n_get_m_free";

interface CampaignWritePayload {
  buy_quantity?: number | null;
  code: string;
  discount_type: CampaignDiscountType;
  discount_value: string;
  ends_at?: Date | null;
  free_quantity?: number | null;
  is_active: boolean;
  max_discount?: string | null;
  min_order_total: string;
  name: string;
  redemption_mode?: "listed" | "code";
  starts_at?: Date | null;
  usage_limit?: number | null;
}

// No 0/O/1/I/L, so a Voucher code read off paper is not mistyped at the POS.
// 30 chars.
const CROCKFORD_CHARSET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;
// Rejection-sample floor: 240 = floor(256/30)*30 — eliminates modulo bias.
const CROCKFORD_SAMPLE_FLOOR = 240;
const MAX_COLLISION_RETRIES = 10;

export const generateCrockfordCode = (): string => {
  const result: string[] = [];
  while (result.length < CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2));
    for (const b of bytes) {
      if (b >= CROCKFORD_SAMPLE_FLOOR) {
        continue;
      }
      result.push(CROCKFORD_CHARSET[b % 30]);
      if (result.length === CODE_LENGTH) {
        break;
      }
    }
  }
  return result.join("");
};

export const mintCampaignCodes = async (
  tx: OrderTx,
  campaignId: number,
  count: number
): Promise<void> => {
  let remaining = count;
  let attempts = 0;

  while (remaining > 0) {
    if (attempts > MAX_COLLISION_RETRIES) {
      throw new Error("Too many code collisions during minting");
    }
    attempts++;
    const candidates = Array.from({ length: remaining }, () =>
      generateCrockfordCode()
    );
    // A duplicate-code error would abort the whole campaign-create transaction
    // (25P02 on retry), so collisions are skipped and only the shortfall retried.
    const inserted = await tx
      .insert(campaignCodesTable)
      .values(candidates.map((code) => ({ campaign_id: campaignId, code })))
      .onConflictDoNothing({ target: campaignCodesTable.code })
      .returning({ id: campaignCodesTable.id });
    remaining -= inserted.length;
  }
};

export const listCampaigns = (filters: CampaignFilters) =>
  db.query.campaignsTable.findMany({
    where: {
      is_active: filters.is_active ?? EmptyFilter,
      redemption_mode: filters.redemption_mode ?? EmptyFilter,
      OR:
        filters.store_id === undefined
          ? EmptyFilter
          : [
              { stores: { store_id: filters.store_id } },
              { NOT: { stores: true } },
            ],
    },
    orderBy: { id: "asc" },
    with: {
      stores: {
        columns: { store_id: true },
        with: {
          store: {
            columns: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
      eligibleServices: {
        columns: { service_id: true },
        with: {
          service: {
            columns: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

export const findCampaignById = (id: number) =>
  db.query.campaignsTable.findFirst({
    where: { id },
    with: {
      stores: {
        columns: { id: true, store_id: true },
        with: {
          store: {
            columns: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
      eligibleServices: {
        columns: { id: true, service_id: true },
        with: {
          service: {
            columns: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

export const findCampaignByCode = (executor: DbExecutor, code: string) =>
  executor.query.campaignCodesTable.findFirst({
    where: { code },
    with: {
      campaign: {
        with: {
          stores: {
            columns: { store_id: true },
            with: {
              store: { columns: { id: true, code: true, name: true } },
            },
          },
          eligibleServices: {
            columns: { service_id: true },
            with: {
              service: { columns: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  });

export const findCampaignByIdWithCodes = (id: number) =>
  db.query.campaignsTable.findFirst({
    where: { id },
    with: {
      codes: {
        columns: {
          id: true,
          code: true,
          redeemed_at: true,
          redeemed_order_id: true,
          created_at: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });

export const findStoresByIds = (storeIds: number[]) =>
  db.query.storesTable.findMany({
    where: { id: { in: storeIds } },
    columns: { id: true },
  });

export const findServicesByIds = (serviceIds: number[]) =>
  db.query.servicesTable.findMany({
    where: { id: { in: serviceIds } },
    columns: { id: true },
  });

export const insertCampaignWithStores = ({
  payload,
  actorId,
  storeIds,
  serviceIds,
  codeCount,
}: {
  payload: CampaignWritePayload;
  actorId: number;
  storeIds: number[];
  serviceIds: number[];
  codeCount?: number;
}) =>
  db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaignsTable)
      .values({
        ...payload,
        created_by: actorId,
        updated_by: actorId,
      })
      .returning();

    if (storeIds.length > 0) {
      await tx.insert(campaignStoresTable).values(
        storeIds.map((storeId) => ({
          campaign_id: campaign.id,
          store_id: storeId,
        }))
      );
    }

    if (serviceIds.length > 0) {
      await tx.insert(campaignEligibleServicesTable).values(
        serviceIds.map((serviceId) => ({
          campaign_id: campaign.id,
          service_id: serviceId,
        }))
      );
    }

    if (payload.redemption_mode === "code" && codeCount && codeCount > 0) {
      await mintCampaignCodes(tx, campaign.id, codeCount);
    }

    return campaign;
  });

export const updateCampaignWithStores = ({
  id,
  payload,
  actorId,
  storeIds,
  serviceIds,
}: {
  id: number;
  payload: Partial<CampaignWritePayload>;
  actorId: number;
  storeIds?: number[];
  serviceIds?: number[];
}) =>
  db.transaction(async (tx) => {
    const rows = await tx
      .update(campaignsTable)
      .set({
        ...payload,
        updated_by: actorId,
      })
      .where(eq(campaignsTable.id, id))
      .returning();

    if (storeIds) {
      await tx
        .delete(campaignStoresTable)
        .where(eq(campaignStoresTable.campaign_id, id));

      if (storeIds.length > 0) {
        await tx.insert(campaignStoresTable).values(
          storeIds.map((storeId) => ({
            campaign_id: id,
            store_id: storeId,
          }))
        );
      }
    }

    if (serviceIds) {
      await tx
        .delete(campaignEligibleServicesTable)
        .where(eq(campaignEligibleServicesTable.campaign_id, id));

      if (serviceIds.length > 0) {
        await tx.insert(campaignEligibleServicesTable).values(
          serviceIds.map((serviceId) => ({
            campaign_id: id,
            service_id: serviceId,
          }))
        );
      }
    }

    return rows[0] ?? null;
  });

export const deleteCampaignById = (id: number) =>
  db
    .delete(campaignsTable)
    .where(eq(campaignsTable.id, id))
    .returning({ id: campaignsTable.id })
    .then((rows) => rows[0] ?? null);

const queryCampaignsWithEligibility = (executor: DbExecutor, ids: number[]) =>
  executor.query.campaignsTable.findMany({
    where: { id: { in: ids } },
    with: {
      stores: { columns: { store_id: true } },
      eligibleServices: { columns: { service_id: true } },
    },
  });

export const findCampaignsByIdsWithEligibility = (
  executor: DbExecutor,
  ids: number[]
) => {
  if (ids.length === 0) {
    return Promise.resolve(
      [] as Awaited<ReturnType<typeof queryCampaignsWithEligibility>>
    );
  }
  return queryCampaignsWithEligibility(executor, ids);
};

export const atomicIncrementCampaignRedeemed = async (
  tx: OrderTx,
  campaignId: number
): Promise<boolean> => {
  const rows = await tx
    .update(campaignsTable)
    .set({ redeemed_count: sql`${campaignsTable.redeemed_count} + 1` })
    .where(
      and(
        eq(campaignsTable.id, campaignId),
        or(
          isNull(campaignsTable.usage_limit),
          sql`${campaignsTable.redeemed_count} < ${campaignsTable.usage_limit}`
        )
      )
    )
    .returning({ id: campaignsTable.id });
  return rows.length > 0;
};

export const atomicClaimCampaignCode = async (
  tx: OrderTx,
  code: string,
  orderId: number
): Promise<{ codeId: number } | null> => {
  const rows = await tx
    .update(campaignCodesTable)
    .set({ redeemed_at: new Date(), redeemed_order_id: orderId })
    .where(
      and(
        eq(campaignCodesTable.code, code),
        isNull(campaignCodesTable.redeemed_at)
      )
    )
    .returning({ id: campaignCodesTable.id });
  return rows[0] ? { codeId: rows[0].id } : null;
};

export const releaseCampaignCodeRedemption = async (
  tx: OrderTx,
  codeId: number
): Promise<void> => {
  await tx
    .update(campaignCodesTable)
    .set({ redeemed_at: null, redeemed_order_id: null })
    .where(eq(campaignCodesTable.id, codeId));
};

export const decrementCampaignRedeemed = async (
  tx: OrderTx,
  campaignId: number
): Promise<void> => {
  await tx
    .update(campaignsTable)
    .set({
      redeemed_count: sql`GREATEST(${campaignsTable.redeemed_count} - 1, 0)`,
    })
    .where(eq(campaignsTable.id, campaignId));
};

export const findOrderCampaignsByOrderId = (tx: OrderTx, orderId: number) =>
  tx.query.orderCampaignsTable.findMany({
    where: { order_id: orderId },
    columns: { id: true, campaign_id: true, code_id: true },
  });

export const findOrderCampaignMinimums = (tx: OrderTx, orderId: number) =>
  tx
    .select({ minOrderTotal: campaignsTable.min_order_total })
    .from(orderCampaignsTable)
    .innerJoin(
      campaignsTable,
      eq(campaignsTable.id, orderCampaignsTable.campaign_id)
    )
    .where(eq(orderCampaignsTable.order_id, orderId));

export const deleteOrderCampaignsByOrderId = (tx: OrderTx, orderId: number) =>
  tx
    .delete(orderCampaignsTable)
    .where(eq(orderCampaignsTable.order_id, orderId));
