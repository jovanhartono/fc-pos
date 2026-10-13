import { Hono } from "hono";
import { GETCounterQuerySchema } from "@/modules/counter/counter.schema";
import { getCounter } from "@/modules/counter/counter.service";
import { assertCanViewCounter } from "@/modules/permissions/permissions";
import type { AdminEnv } from "@/types/hono";
import { assertStoreAccess } from "@/utils/authorization";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono<AdminEnv>().get(
  "/",
  zodValidator("query", GETCounterQuerySchema),
  async (c) => {
    const user = c.get("jwtPayload");
    assertCanViewCounter(user);
    const { store_id } = c.req.valid("query");
    await assertStoreAccess(user, store_id);

    return c.json(success(await getCounter(store_id)));
  }
);

export default app;
