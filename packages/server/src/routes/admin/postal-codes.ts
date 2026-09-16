import { Hono } from "hono";
import { GETPostalCodesQuerySchema } from "@/modules/postal-codes/postal-code.schema";
import { getPostalCodes } from "@/modules/postal-codes/postal-code.service";
import type { AdminEnv } from "@/types/hono";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono<AdminEnv>().get(
  "/",
  zodValidator("query", GETPostalCodesQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const postalCodes = await getPostalCodes(query);

    return c.json(success(postalCodes));
  }
);

export default app;
