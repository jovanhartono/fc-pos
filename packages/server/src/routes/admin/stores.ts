import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { NotFoundException } from "@/http-exceptions";
import {
  GETNearestStoreQuerySchema,
  PATCHStoreSchema,
  POSTStoreSchema,
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
import {
  deviceIdParamSchema,
  POSTStoreDeviceSchema,
} from "@/modules/stores/store-device.schema";
import {
  getStoreDevices,
  registerStoreDevice,
  removeStoreDevice,
} from "@/modules/stores/store-device.service";
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

      return c.json(success(stores));
    }
  )
  .post("/", zodValidator("json", POSTStoreSchema), async (c) => {
    const storeData = c.req.valid("json");

    const store = await createStore(storeData);

    return c.json(success(store, "Store created"), StatusCodes.CREATED);
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const store = await getStoreById(id);

    if (!store) {
      throw new NotFoundException("Store not found");
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
        throw new NotFoundException("Store not found");
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
        throw new NotFoundException("Store not found");
      }

      const statusText = data.is_active ? "Activated" : "Deactivated";
      return c.json(success(store, `${store.name} is ${statusText}`));
    }
  )
  // Bluetooth devices the POS may print to. The cashier registers them at the
  // counter, so a cashier may manage this list, but only for their own store.
  // (The store edit routes above still have no admin-only check; known gap.)
  .get("/:id/devices", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    await assertStoreAccess(c.get("jwtPayload"), id);

    return c.json(success(await getStoreDevices(id)));
  })
  .post(
    "/:id/devices",
    idParamSchema,
    zodValidator("json", POSTStoreDeviceSchema),
    async (c) => {
      const { id } = c.req.valid("param");

      await assertStoreAccess(c.get("jwtPayload"), id);

      const device = await registerStoreDevice(id, c.req.valid("json"));

      return c.json(
        success(device, `${device.name} registered`),
        StatusCodes.CREATED
      );
    }
  )
  .delete(
    "/:id/devices/:deviceId",
    zodValidator("param", deviceIdParamSchema),
    async (c) => {
      const { id, deviceId } = c.req.valid("param");

      await assertStoreAccess(c.get("jwtPayload"), id);

      const device = await removeStoreDevice(id, deviceId);

      if (!device) {
        throw new NotFoundException("Device not found");
      }

      return c.json(success(device, `${device.name} removed`));
    }
  );

export default app;
