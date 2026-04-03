import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  POSTServiceSchema,
  PUTServiceSchema,
} from "@/modules/services/service.schema";
import {
  createService,
  getServiceById,
  getServices,
  updateService,
} from "@/modules/services/service.service";
import { idParamSchema } from "@/schema/param";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", async (c) => {
    const services = await getServices();

    return c.json(success(services));
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const service = await getServiceById(id);

    if (!service) {
      return c.json(failure("Service not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(service, "Service retrieved successfully"));
  })
  .post("/", zodValidator("json", POSTServiceSchema), async (c) => {
    const body = c.req.valid("json");

    const service = await createService(body);

    return c.json(
      success(service, "Create service success"),
      StatusCodes.CREATED
    );
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTServiceSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const service = await updateService(id, body);

      if (!service) {
        return c.json(failure("Service does not exist"), StatusCodes.NOT_FOUND);
      }

      return c.json(success(service, `Update service ${service.code} success`));
    }
  );

export default app;
