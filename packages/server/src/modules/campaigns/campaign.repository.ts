import { and, eq, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignStoresTable, campaignsTable } from "@/db/schema";

interface CampaignFilters {
  is_active?: boolean;
  store_id?: number;
}

function buildCountWhere(filters: CampaignFilters) {
  const conditions: SQL[] = [];

  if (filters.is_active !== undefined) {
    conditions.push(eq(campaignsTable.is_active, filters.is_active));
  }

  if (filters.store_id !== undefined) {
    conditions.push(sql`(
      EXISTS (
        SELECT 1
        FROM ${campaignStoresTable} scoped_store
        WHERE scoped_store.campaign_id = ${campaignsTable.id}
        AND scoped_store.store_id = ${filters.store_id}
      )
      OR NOT EXISTS (
        SELECT 1
        FROM ${campaignStoresTable} any_store
        WHERE any_store.campaign_id = ${campaignsTable.id}
      )
    )`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function listCampaigns({
  filters,
  limit,
  offset,
}: {
  filters: CampaignFilters;
  limit: number;
  offset: number;
}) {
  return db.query.campaignsTable.findMany({
    where: {
      is_active: filters.is_active,
      stores: filters.store_id
        ? {
            OR: [{ store_id: filters.store_id }, { NOT: { store: true } }],
          }
        : undefined,
    },
    orderBy: { id: "asc" },
    limit,
    offset,
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
    },
  });
}

export function countCampaigns(filters: CampaignFilters) {
  return db.$count(campaignsTable, buildCountWhere(filters));
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
    },
  });
}

export function findStoresByIds(storeIds: number[]) {
  return db.query.storesTable.findMany({
    where: { id: { in: storeIds } },
    columns: { id: true },
  });
}

export function insertCampaignWithStores({
  payload,
  actorId,
  storeIds,
}: {
  payload: {
    code: string;
    name: string;
    discount_type: "fixed" | "percentage";
    discount_value: string;
    max_discount?: string | null;
    min_order_total: string;
    starts_at?: Date | null;
    ends_at?: Date | null;
    is_active: boolean;
  };
  actorId: number;
  storeIds: number[];
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

    return campaign;
  });
}

export function updateCampaignWithStores({
  id,
  payload,
  actorId,
  storeIds,
}: {
  id: number;
  payload: Partial<{
    code: string;
    name: string;
    discount_type: "fixed" | "percentage";
    discount_value: string;
    max_discount?: string | null;
    min_order_total: string;
    starts_at?: Date | null;
    ends_at?: Date | null;
    is_active: boolean;
  }>;
  actorId: number;
  storeIds?: number[];
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
