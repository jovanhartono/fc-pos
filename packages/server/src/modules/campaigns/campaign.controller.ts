import type {
  CampaignPayload,
  GetCampaignsQuery,
} from "@/modules/campaigns/campaign.schema";
import {
  createCampaignService,
  deleteCampaignService,
  getCampaignById,
  getCampaigns,
  updateCampaignService,
} from "@/modules/campaigns/campaign.service";
import type { JWTPayload } from "@/types";

export function getCampaignsController(query?: GetCampaignsQuery) {
  return getCampaigns(query);
}

export function getCampaignByIdController(id: number) {
  return getCampaignById(id);
}

export function createCampaignController({
  user,
  payload,
}: {
  user: JWTPayload;
  payload: CampaignPayload;
}) {
  return createCampaignService({ user, payload });
}

export function updateCampaignController({
  user,
  id,
  payload,
}: {
  user: JWTPayload;
  id: number;
  payload: Partial<CampaignPayload>;
}) {
  return updateCampaignService({ user, id, payload });
}

export function deleteCampaignController({
  user,
  id,
}: {
  user: JWTPayload;
  id: number;
}) {
  return deleteCampaignService({ user, id });
}
