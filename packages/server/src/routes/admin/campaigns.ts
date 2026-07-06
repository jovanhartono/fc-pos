import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { findCampaignByIdWithCodes } from "@/modules/campaigns/campaign.repository";
import {
  CampaignPayloadSchema,
  CampaignUpdatePayloadSchema,
  GETCampaignsQuerySchema,
} from "@/modules/campaigns/campaign.schema";
import {
  createCampaign,
  deleteCampaign,
  getCampaignById,
  getCampaigns,
  resolveVoucherCode,
  updateCampaign,
} from "@/modules/campaigns/campaign.service";
import { findStoreById } from "@/modules/stores/store.repository";
import { idParamSchema } from "@/schema/param";
import type { JWTPayload } from "@/types";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", zodValidator("query", GETCampaignsQuerySchema), async (c) => {
    const query = c.req.valid("query");

    const items = await getCampaigns(query);

    return c.json(success(items));
  })
  .post(
    "/resolve-code",
    zodValidator(
      "json",
      z.object({
        code: z
          .string()
          .min(1)
          .max(32)
          .transform((s) => s.toUpperCase()),
        gross_total: z.coerce.number().nonnegative(),
        store_id: z.coerce.number().int().positive(),
      })
    ),
    async (c) => {
      const { code, gross_total, store_id } = c.req.valid("json");

      const store = await findStoreById(store_id);
      if (!store) {
        return c.json(failure("Store not found"), StatusCodes.NOT_FOUND);
      }

      const resolved = await resolveVoucherCode(code, {
        grossTotal: gross_total,
        storeCode: store.code,
        storeId: store_id,
      });

      // Strip internal-only field before returning to the client
      const { _voucherCode: _, ...responseData } = resolved;
      return c.json(success(responseData));
    }
  )
  .get("/:id/codes", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const campaign = await findCampaignByIdWithCodes(id);
    if (!campaign) {
      return c.json(failure("Campaign not found"), StatusCodes.NOT_FOUND);
    }
    if (campaign.redemption_mode !== "code") {
      return c.json(
        failure("Campaign is not a voucher campaign"),
        StatusCodes.BAD_REQUEST
      );
    }

    const total = campaign.codes.length;
    const redeemed = campaign.codes.filter(
      (code) => code.redeemed_at !== null
    ).length;

    return c.json(
      success({
        campaign_id: id,
        codes: campaign.codes,
        redeemed,
        remaining: total - redeemed,
        total,
      })
    );
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const campaign = await getCampaignById(id);

    if (!campaign) {
      return c.json(failure("Campaign not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(campaign, "Campaign retrieved successfully"));
  })
  .post("/", zodValidator("json", CampaignPayloadSchema), async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const body = c.req.valid("json");

    const campaign = await createCampaign({
      user,
      payload: body,
    });

    return c.json(
      success(campaign, "Campaign created successfully"),
      StatusCodes.CREATED
    );
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", CampaignUpdatePayloadSchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const campaign = await updateCampaign({
        user,
        id,
        payload: body,
      });

      if (!campaign) {
        return c.json(
          failure("Campaign does not exist"),
          StatusCodes.NOT_FOUND
        );
      }

      return c.json(success(campaign, "Campaign updated successfully"));
    }
  )
  .delete("/:id", idParamSchema, async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const { id } = c.req.valid("param");

    const deleted = await deleteCampaign({ user, id });

    if (!deleted) {
      return c.json(failure("Campaign not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(deleted, "Campaign deleted successfully"));
  });

export default app;
