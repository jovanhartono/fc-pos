import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignCodesTable,
  campaignEligibleServicesTable,
  campaignStoresTable,
  campaignsTable,
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

// Crockford base32: excludes 0/O/1/I/L — money-bearing bearer secret.
const CROCKFORD_CHARSET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // 30 chars
const CODE_LENGTH = 8;
// Rejection-sample floor: 240 = floor(256/30)*30 — eliminates modulo bias.
const CROCKFORD_SAMPLE_FLOOR = 240;
const MAX_COLLISION_RETRIES = 10;

export function generateCrockfordCode(): string {
  const result: string[] = [];
  while (result.length < CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2));
    for (const b of bytes) {
      if (b >= CROCKFORD_SAMPLE_FLOOR) {
        continue; // reject to eliminate modulo bias
      }
      result.push(CROCKFORD_CHARSET[b % 30]);
      if (result.length === CODE_LENGTH) {
        break;
      }
    }
  }
  return result.join("");
}

export async function mintCampaignCodes(
  tx: OrderTx,
  campaignId: number,
  count: number
): Promise<void> {
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
    // ON CONFLICT DO NOTHING so a rare code collision silently skips that row
    // rather than raising 23505 — which, inside the enclosing campaign-create
    // transaction, would poison the tx and make any retry fail with 25P02.
    // Only the shortfall (codes that collided) is retried with a fresh batch.
    const inserted = await tx
      .insert(campaignCodesTable)
      .values(candidates.map((code) => ({ campaign_id: campaignId, code })))
      .onConflictDoNothing({ target: campaignCodesTable.code })
      .returning({ id: campaignCodesTable.id });
    remaining -= inserted.length;
  }
}

export function listCampaigns(filters: CampaignFilters) {
  return db.query.campaignsTable.findMany({
    where: {
      is_active: filters.is_active,
      redemption_mode: filters.redemption_mode,
      ...(filters.store_id === undefined
        ? {}
        : {
            OR: [
              { stores: { store_id: filters.store_id } },
              { NOT: { stores: true } },
            ],
          }),
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
}

export function findCampaignById(id: number) {
  return db.query.campaignsTable.findFirst({
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
}

export function findCampaignByCode(code: string) {
  return db.query.campaignCodesTable.findFirst({
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
}

export function findCampaignByIdWithCodes(id: number) {
  // The /:id/codes route reads only redemption_mode + codes, so skip the
  // stores/eligibleServices joins the general campaign lookups carry.
  return db.query.campaignsTable.findFirst({
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
}

export function findStoresByIds(storeIds: number[]) {
  return db.query.storesTable.findMany({
    where: { id: { in: storeIds } },
    columns: { id: true },
  });
}

export function findServicesByIds(serviceIds: number[]) {
  return db.query.servicesTable.findMany({
    where: { id: { in: serviceIds } },
    columns: { id: true },
  });
}

export function insertCampaignWithStores({
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
}) {
  return db.transaction(async (tx) => {
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
}

export function updateCampaignWithStores({
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
}) {
  return db.transaction(async (tx) => {
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
}

export function deleteCampaignById(id: number) {
  return db
    .delete(campaignsTable)
    .where(eq(campaignsTable.id, id))
    .returning({ id: campaignsTable.id })
    .then((rows) => rows[0] ?? null);
}

export function findCampaignsByIdsWithEligibility(ids: number[]) {
  if (ids.length === 0) {
    return Promise.resolve(
      [] as Awaited<ReturnType<typeof queryCampaignsWithEligibility>>
    );
  }
  return queryCampaignsWithEligibility(ids);
}

function queryCampaignsWithEligibility(ids: number[]) {
  return db.query.campaignsTable.findMany({
    where: { id: { in: ids } },
    with: {
      stores: { columns: { store_id: true } },
      eligibleServices: { columns: { service_id: true } },
    },
  });
}

export async function atomicIncrementCampaignRedeemed(
  tx: OrderTx,
  campaignId: number
): Promise<boolean> {
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
}

export async function atomicClaimCampaignCode(
  tx: OrderTx,
  code: string,
  orderId: number
): Promise<{ codeId: number } | null> {
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
}

export async function releaseCampaignCodeRedemption(
  tx: OrderTx,
  codeId: number
): Promise<void> {
  await tx
    .update(campaignCodesTable)
    .set({ redeemed_at: null, redeemed_order_id: null })
    .where(eq(campaignCodesTable.id, codeId));
}

export async function decrementCampaignRedeemed(
  tx: OrderTx,
  campaignId: number
): Promise<void> {
  await tx
    .update(campaignsTable)
    .set({
      redeemed_count: sql`GREATEST(${campaignsTable.redeemed_count} - 1, 0)`,
    })
    .where(eq(campaignsTable.id, campaignId));
}

export function findOrderCampaignsByOrderId(tx: OrderTx, orderId: number) {
  return tx.query.orderCampaignsTable.findMany({
    where: { order_id: orderId },
    columns: { id: true, campaign_id: true, code_id: true },
  });
}
