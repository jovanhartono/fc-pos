import { BadRequestException, NotFoundException } from "@/errors";
import {
  deleteCampaignById,
  findCampaignByCode,
  findCampaignById,
  findCampaignsByIdsWithEligibility,
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
import { assertCanManageCampaigns } from "@/modules/permissions/permissions";
import { campaignIneligibilityReason } from "@/schema/campaign-eligibility";
import type { JWTPayload } from "@/types";

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
    // POS queries with is_active:true — exclude vouchers from that list so
    // code-mode campaigns never surface as selectable tiles.
    redemption_mode: query?.is_active === true ? "listed" : undefined,
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

// Resolve a bearer voucher code to its owning campaign, shaped EXACTLY like a
// listCampaigns row (nested stores + eligibleServices, is_expired via
// markExpired) plus an internal-only _voucherCode. The caller (route) strips
// _voucherCode before responding; createOrder uses it to claim the code.
export async function resolveVoucherCode(
  code: string,
  ctx: { storeId: number; storeCode: string; grossTotal: number }
) {
  const row = await findCampaignByCode(code);

  if (!row) {
    throw new BadRequestException(`Voucher code not found: ${code}`);
  }
  if (row.redeemed_at !== null) {
    throw new BadRequestException(
      `Voucher code ${code} has already been redeemed`
    );
  }

  const { campaign } = row;
  if (campaign.redemption_mode !== "code") {
    throw new BadRequestException(
      `Code ${code} does not belong to a voucher campaign`
    );
  }

  const now = new Date();
  const reason = campaignIneligibilityReason(
    {
      code: campaign.code,
      ends_at: campaign.ends_at,
      is_active: campaign.is_active,
      min_order_total: campaign.min_order_total,
      starts_at: campaign.starts_at,
      stores: campaign.stores,
    },
    {
      now,
      grossTotal: ctx.grossTotal,
      storeId: ctx.storeId,
      storeCode: ctx.storeCode,
    }
  );
  if (reason) {
    throw new BadRequestException(reason);
  }

  return {
    ...markExpired(campaign, now),
    _voucherCode: code,
  };
}

function buildCreatePayload(payload: CampaignPayload) {
  // usage_limit only applies to listed campaigns (mode-exclusivity CHECK).
  const usage_limit =
    payload.redemption_mode === "code" ? null : (payload.usage_limit ?? null);

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
      redemption_mode: payload.redemption_mode,
      usage_limit,
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
    redemption_mode: payload.redemption_mode,
    usage_limit,
  };
}

interface UpdateWritePayload {
  buy_quantity?: number | null;
  code?: string;
  discount_type?: "fixed" | "percentage" | "buy_n_get_m_free";
  discount_value?: string;
  ends_at?: Date | null;
  free_quantity?: number | null;
  is_active?: boolean;
  max_discount?: string | null;
  min_order_total?: string;
  name?: string;
  starts_at?: Date | null;
  // redemption_mode and code_count are immutable after create — never in this
  // list, so they can never be written on update.
  usage_limit?: number | null;
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
  "usage_limit",
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
  assertCanManageCampaigns(user);

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
    // Only code-mode campaigns mint a bearer-code batch.
    codeCount:
      payload.redemption_mode === "code"
        ? (payload.code_count ?? undefined)
        : undefined,
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
  assertCanManageCampaigns(user);

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
  assertCanManageCampaigns(user);
  return deleteCampaignById(id);
}

type CampaignEligibility = Pick<
  Awaited<ReturnType<typeof findCampaignsByIdsWithEligibility>>[number],
  "code" | "ends_at" | "is_active" | "min_order_total" | "starts_at" | "stores"
>;

export function assertCampaignUsable(
  campaign: CampaignEligibility,
  ctx: { now: Date; grossTotal: number; storeId: number; storeCode: string }
) {
  const reason = campaignIneligibilityReason(campaign, ctx);
  if (reason) {
    throw new BadRequestException(reason);
  }
}

export async function getUsableCampaigns({
  campaignIds,
  grossTotal,
  storeId,
  storeCode,
}: {
  campaignIds: number[];
  grossTotal: number;
  storeId: number;
  storeCode: string;
}) {
  const campaigns = await findCampaignsByIdsWithEligibility(campaignIds);

  // Missing-id check FIRST so "not found" wins over "wrong mode".
  const foundIds = new Set(campaigns.map((item) => item.id));
  const missing = campaignIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new NotFoundException(`Campaign not found: ${missing.join(", ")}`);
  }

  // Reject code-mode campaigns sent via campaign_ids — they must go through
  // voucher_codes so a bearer code is claimed atomically.
  const codeModes = campaigns.filter(
    (campaign) => campaign.redemption_mode === "code"
  );
  if (codeModes.length > 0) {
    throw new BadRequestException(
      `Campaign ${codeModes
        .map((campaign) => campaign.id)
        .join(", ")} is a voucher — submit via voucher_codes, not campaign_ids`
    );
  }

  const now = new Date();
  for (const campaign of campaigns) {
    assertCampaignUsable(campaign, { now, grossTotal, storeId, storeCode });
  }

  return campaigns.map(
    ({ stores: _stores, eligibleServices, ...campaign }) => ({
      ...campaign,
      eligible_service_ids: eligibleServices.map((entry) => entry.service_id),
    })
  );
}
