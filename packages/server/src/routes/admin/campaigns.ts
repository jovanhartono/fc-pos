import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  createCampaignController,
  deleteCampaignController,
  getCampaignByIdController,
  getCampaignsController,
  updateCampaignController,
} from "@/modules/campaigns/campaign.controller";
import {
  CampaignPayloadSchema,
  GETCampaignsQuerySchema,
} from "@/modules/campaigns/campaign.schema";
import { idParamSchema } from "@/schema/param";
import type { JWTPayload } from "@/types";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", zodValidator("query", GETCampaignsQuerySchema), async (c) => {
    const query = c.req.valid("query");

    const { items, meta } = await getCampaignsController(query);

    return c.json(success(items, undefined, meta));
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const campaign = await getCampaignByIdController(id);

    if (!campaign) {
      return c.json(failure("Campaign not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(campaign, "Campaign retrieved successfully"));
  })
  .post("/", zodValidator("json", CampaignPayloadSchema), async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const body = c.req.valid("json");

    const campaign = await createCampaignController({
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
    zodValidator("json", CampaignPayloadSchema.partial()),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const campaign = await updateCampaignController({
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

    const deleted = await deleteCampaignController({ user, id });

    if (!deleted) {
      return c.json(failure("Campaign not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(deleted, "Campaign deleted successfully"));
  });

export default app;
