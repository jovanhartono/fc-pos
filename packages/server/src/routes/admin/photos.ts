import { Hono } from "hono";
import { POSTPhotoDownloadUrlSchema } from "@/modules/orders/order-admin.schema";
import { createPhotoDownloadUrl } from "@/modules/orders/order-photo.service";
import type { AdminEnv } from "@/types/hono";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono<AdminEnv>().post(
  "/download-url",
  zodValidator("json", POSTPhotoDownloadUrlSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("jwtPayload");
    const download = await createPhotoDownloadUrl({ body, user });

    return c.json(success(download, "Download URL generated successfully"));
  }
);

export default app;
