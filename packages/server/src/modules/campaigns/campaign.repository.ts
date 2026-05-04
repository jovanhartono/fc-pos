import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignEligibleServicesTable,
  campaignStoresTable,
  campaignsTable,
} from "@/db/schema";

interface CampaignFilters {
  is_active?: boolean;
  store_id?: number;
}

type CampaignDiscountType = "fixed" | "percentage" | "buy_n_get_m_free";

interface CampaignWritePayload {
  code: string;
  name: string;
  discount_type: CampaignDiscountType;
  discount_value: string;
  max_discount?: string | null;
  min_order_total: string;
  starts_at?: Date | null;
  ends_at?: Date | null;
  is_active: boolean;
  buy_quantity?: number | null;
  free_quantity?: number | null;
}

export function listCampaigns(filters: CampaignFilters) {
  return db.query.campaignsTable.findMany({
    where: {
      is_active: filters.is_active,
      ...(filters.store_id !== undefined
        ? {
            OR: [
              { stores: { store_id: filters.store_id } },
              { NOT: { stores: true } },
            ],
          }
        : {}),
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
}: {
  payload: CampaignWritePayload;
  actorId: number;
  storeIds: number[];
  serviceIds: number[];
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
