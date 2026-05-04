import { BadRequestException, ForbiddenException } from "@/errors";
import {
  deleteCampaignById,
  findCampaignById,
  findServicesByIds,
  findStoresByIds,
  insertCampaignWithStores,
  listCampaigns,
  updateCampaignWithStores,
} from "@/modules/campaigns/campaign.repository";
import type {
  CampaignPayload,
  CampaignUpdatePayload,
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

async function ensureServicesExist(serviceIds: number[]) {
  if (serviceIds.length === 0) {
    return;
  }

  const services = await findServicesByIds(serviceIds);

  if (services.length !== serviceIds.length) {
    throw new BadRequestException(
      "One or more eligible_service_ids are invalid"
    );
  }
}

function markExpired<T extends { ends_at: Date | null }>(
  campaign: T,
  now: Date
): T & { is_expired: boolean } {
  return {
    ...campaign,
    is_expired: campaign.ends_at !== null && campaign.ends_at < now,
  };
}

export async function getCampaigns(query?: GetCampaignsQuery) {
  const now = new Date();
  const campaigns = await listCampaigns({
    is_active: query?.is_active,
    store_id: query?.store_id,
  });

  return campaigns.map((campaign) => markExpired(campaign, now));
}

export async function getCampaignById(id: number) {
  const campaign = await findCampaignById(id);
  if (!campaign) {
    return campaign;
  }
  return markExpired(campaign, new Date());
}

function buildCreatePayload(payload: CampaignPayload) {
  if (payload.discount_type === "buy_n_get_m_free") {
    return {
      code: payload.code,
      name: payload.name,
      discount_type: payload.discount_type,
      discount_value: "0",
      max_discount: null,
      buy_quantity: payload.buy_quantity,
      free_quantity: payload.free_quantity,
      min_order_total: payload.min_order_total,
      starts_at: payload.starts_at ?? null,
      ends_at: payload.ends_at ?? null,
      is_active: payload.is_active,
    };
  }

  return {
    code: payload.code,
    name: payload.name,
    discount_type: payload.discount_type,
    discount_value: payload.discount_value,
    max_discount: payload.max_discount ?? null,
    buy_quantity: null,
    free_quantity: null,
    min_order_total: payload.min_order_total,
    starts_at: payload.starts_at ?? null,
    ends_at: payload.ends_at ?? null,
    is_active: payload.is_active,
  };
}

interface UpdateWritePayload {
  code?: string;
  name?: string;
  discount_type?: "fixed" | "percentage" | "buy_n_get_m_free";
  discount_value?: string;
  max_discount?: string | null;
  min_order_total?: string;
  starts_at?: Date | null;
  ends_at?: Date | null;
  is_active?: boolean;
  buy_quantity?: number | null;
  free_quantity?: number | null;
}

const UPDATE_FIELDS = [
  "code",
  "name",
  "discount_type",
  "discount_value",
  "max_discount",
  "min_order_total",
  "starts_at",
  "ends_at",
  "is_active",
  "buy_quantity",
  "free_quantity",
] as const satisfies ReadonlyArray<keyof UpdateWritePayload>;

function buildUpdatePayload(
  payload: CampaignUpdatePayload
): UpdateWritePayload {
  const out: UpdateWritePayload = {};
  for (const key of UPDATE_FIELDS) {
    const value = payload[key];
    if (value !== undefined) {
      (out[key] as unknown) = value;
    }
  }

  if (payload.discount_type === "buy_n_get_m_free") {
    out.discount_value = "0";
    if (out.max_discount === undefined) {
      out.max_discount = null;
    }
  } else if (
    payload.discount_type === "fixed" ||
    payload.discount_type === "percentage"
  ) {
    out.buy_quantity = null;
    out.free_quantity = null;
  }

  return out;
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
  const serviceIds = [...new Set(payload.eligible_service_ids)];

  await Promise.all([
    ensureStoresExist(storeIds),
    ensureServicesExist(serviceIds),
  ]);

  return insertCampaignWithStores({
    payload: buildCreatePayload(payload),
    actorId: user.id,
    storeIds,
    serviceIds,
  });
}

export async function updateCampaign({
  user,
  id,
  payload,
}: {
  user: JWTPayload;
  id: number;
  payload: CampaignUpdatePayload;
}) {
  assertIsAdmin(user);

  const storeIds = payload.store_ids
    ? [...new Set(payload.store_ids)]
    : undefined;
  const serviceIds = payload.eligible_service_ids
    ? [...new Set(payload.eligible_service_ids)]
    : undefined;

  await Promise.all([
    storeIds ? ensureStoresExist(storeIds) : Promise.resolve(),
    serviceIds ? ensureServicesExist(serviceIds) : Promise.resolve(),
  ]);

  return updateCampaignWithStores({
    id,
    payload: buildUpdatePayload(payload),
    actorId: user.id,
    storeIds,
    serviceIds,
  });
}

export function deleteCampaign({ user, id }: { user: JWTPayload; id: number }) {
  assertIsAdmin(user);
  return deleteCampaignById(id);
}
