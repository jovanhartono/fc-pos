import { BadRequestException, ForbiddenException } from "@/errors";
import {
  deleteCampaignById,
  findCampaignById,
  findStoresByIds,
  insertCampaignWithStores,
  listCampaigns,
  updateCampaignWithStores,
} from "@/modules/campaigns/campaign.repository";
import type {
  CampaignPayload,
  GetCampaignsQuery,
} from "@/modules/campaigns/campaign.schema";
import type { JWTPayload } from "@/types";

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

export function getCampaigns(query?: GetCampaignsQuery) {
  return listCampaigns({
    is_active: query?.is_active,
    store_id: query?.store_id,
  });
}

export function getCampaignById(id: number) {
  return findCampaignById(id);
}

export async function createCampaign({
  user,
  payload,
}: {
  user: JWTPayload;
  payload: CampaignPayload;
}) {
  assertIsAdmin(user);

  const storeIds = [...new Set(payload.store_ids)];
  await ensureStoresExist(storeIds);

  return insertCampaignWithStores({
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

export async function updateCampaign({
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

export function deleteCampaign({ user, id }: { user: JWTPayload; id: number }) {
  assertIsAdmin(user);
  return deleteCampaignById(id);
}
