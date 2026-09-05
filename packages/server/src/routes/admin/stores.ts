import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { NotFoundException } from "@/http-exceptions";
import {
  GETNearestStoreQuerySchema,
  PATCHStoreSchema,
  POSTStoreSchema,
  PUTStorePrinterSchema,
  PUTStoreSchema,
} from "@/modules/stores/store.schema";
import {
  createStore,
  getNearestStores,
  getStoreById,
  getStores,
  updateStore,
  updateStoreStatus,
} from "@/modules/stores/store.service";
import { idParamSchema } from "@/schema/param";
import type { AdminEnv } from "@/types/hono";
import { assertStoreAccess } from "@/utils/authorization";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const stores = await getStores();

    return c.json(success(stores));
  })
  .get(
    "/nearest",
    zodValidator("query", GETNearestStoreQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const stores = await getNearestStores(query);

      return c.json(success(stores, "Nearest store retrieved successfully"));
    }
  )
  .post("/", zodValidator("json", POSTStoreSchema), async (c) => {
    const storeData = c.req.valid("json");

    const store = await createStore(storeData);

    return c.json(
      success(store, "Successfully adding new store"),
      StatusCodes.CREATED
    );
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const store = await getStoreById(id);

    if (!store) {
      throw new NotFoundException("Store does not exist");
    }

    return c.json(success(store));
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTStoreSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const { code: _, ...storeData } = c.req.valid("json");

      const store = await updateStore({
        id,
        payload: storeData,
      });

      if (!store) {
        throw new NotFoundException("Store does not exist");
      }

      return c.json(success(store, `Successfully updated ${store.name}`));
    }
  )
  .patch(
    "/:id",
    idParamSchema,
    zodValidator("json", PATCHStoreSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const data = c.req.valid("json");

      const store = await updateStoreStatus({
        id,
        is_active: !!data.is_active,
      });

      if (!store) {
        throw new NotFoundException("Store does not exist");
      }

      const statusText = data.is_active ? "Activated" : "Deactivated";
      return c.json(success(store, `${store.name} is ${statusText}`));
    }
  )
  // The POS that just paired the receipt printer remembers it for the store.
  // Pairing happens at the counter, so this is the one store write meant for a
  // cashier, scoped to a store they work at: a Kemang POS must not point
  // Bintaro's receipts at its own printer. (The sibling PUT/PATCH above carry
  // no role check yet — a known gap tracked separately, not widened here.)
  .put(
    "/:id/printer",
    idParamSchema,
    zodValidator("json", PUTStorePrinterSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const { printer_name } = c.req.valid("json");

      await assertStoreAccess(c.get("jwtPayload"), id);

      const store = await updateStore({ id, payload: { printer_name } });

      if (!store) {
        throw new NotFoundException("Store does not exist");
      }

      return c.json(success(store, `Printer remembered for ${store.name}`));
    }
  );

export default app;
