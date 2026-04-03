import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  GETOrderServiceImagesQuerySchema,
  POSTOrderServiceImageSchema,
  PUTOrderServiceImageSchema,
} from "@/modules/order-service-images/order-service-image.schema";
import {
  createOrderServiceImage,
  deleteOrderServiceImage,
  getOrderServiceImageById,
  getOrderServiceImages,
  updateOrderServiceImage,
} from "@/modules/order-service-images/order-service-image.service";
import { idParamSchema } from "@/schema/param";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get(
    "/",
    zodValidator("query", GETOrderServiceImagesQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const { items, meta } = await getOrderServiceImages(query);

      return c.json(success(items, undefined, meta));
    }
  )
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const image = await getOrderServiceImageById(id);

    if (!image) {
      return c.json(
        failure("Order service image not found"),
        StatusCodes.NOT_FOUND
      );
    }

    return c.json(success(image, "Order service image retrieved successfully"));
  })
  .post("/", zodValidator("json", POSTOrderServiceImageSchema), async (c) => {
    const body = c.req.valid("json");

    const image = await createOrderServiceImage(body);

    return c.json(
      success(image, "Create order service image success"),
      StatusCodes.CREATED
    );
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTOrderServiceImageSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const image = await updateOrderServiceImage(id, body);

      if (!image) {
        return c.json(
          failure("Order service image does not exist"),
          StatusCodes.NOT_FOUND
        );
      }

      return c.json(success(image, "Order service image updated successfully"));
    }
  )
  .delete("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const rows = await deleteOrderServiceImage(id);

    if (rows.length === 0) {
      return c.json(
        failure("Order service image not found"),
        StatusCodes.NOT_FOUND
      );
    }

    return c.json(success(rows[0], "Order service image deleted successfully"));
  });

export default app;
