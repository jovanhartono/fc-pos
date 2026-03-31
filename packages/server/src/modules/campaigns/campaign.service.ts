import { BadRequestException, ForbiddenException } from "@/errors";
import {
  countCampaigns,
  createCampaignWithStores,
  deleteCampaign,
  findCampaignById,
  findStoresByIds,
  listCampaigns,
  updateCampaignWithStores,
} from "@/modules/campaigns/campaign.repository";
import type {
  CampaignPayload,
  GetCampaignsQuery,
} from "@/modules/campaigns/campaign.schema";
import type { JWTPayload } from "@/types";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";

function assertIsAdmin(user: JWTPayload) {
  if (user.role !== "admin") {
    throw new ForbiddenException("Only admin can perform this action");
  }
}

async function ensureStoresExist(storeIds: number[]) {
  if (storeIds.length === 0) {
    return;
  }

  const stores = await findStoresByIds(storeIds);

  if (stores.length !== storeIds.length) {
    throw new BadRequestException("One or more store_ids are invalid");
  }
}

export async function getCampaigns(query?: GetCampaignsQuery) {
  const pagination = normalizePagination(query, { maxPageSize: 100 });
  const filters = {
    is_active: query?.is_active,
    store_id: query?.store_id,
  };

  const [items, total] = await Promise.all([
    listCampaigns({
      filters,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    countCampaigns(filters),
  ]);

  return {
    items,
    meta: buildPaginationMeta(total, pagination),
  };
}

export function getCampaignById(id: number) {
  return findCampaignById(id);
}

export async function createCampaignService({
  user,
  payload,
}: {
  user: JWTPayload;
  payload: CampaignPayload;
}) {
  assertIsAdmin(user);

  const storeIds = [...new Set(payload.store_ids)];
  await ensureStoresExist(storeIds);

  return createCampaignWithStores({
    payload: {
      code: payload.code,
      name: payload.name,
      discount_type: payload.discount_type,
      discount_value: payload.discount_value,
      max_discount: payload.max_discount ?? null,
      min_order_total: payload.min_order_total,
      starts_at: payload.starts_at ?? null,
      ends_at: payload.ends_at ?? null,
      is_active: payload.is_active,
    },
    actorId: user.id,
    storeIds,
  });
}

export async function updateCampaignService({
  user,
  id,
  payload,
}: {
  user: JWTPayload;
  id: number;
  payload: Partial<CampaignPayload>;
}) {
  assertIsAdmin(user);

  const storeIds = payload.store_ids
    ? [...new Set(payload.store_ids)]
    : undefined;
  if (storeIds) {
    await ensureStoresExist(storeIds);
  }

  return updateCampaignWithStores({
    id,
    payload: {
      code: payload.code,
      name: payload.name,
      discount_type: payload.discount_type,
      discount_value: payload.discount_value,
      max_discount: payload.max_discount,
      min_order_total: payload.min_order_total,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at,
      is_active: payload.is_active,
    },
    actorId: user.id,
    storeIds,
  });
}

export function deleteCampaignService({
  user,
  id,
}: {
  user: JWTPayload;
  id: number;
}) {
  assertIsAdmin(user);
  return deleteCampaign(id);
}
