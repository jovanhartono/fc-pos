import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  POSTProductSchema,
  PUTProductSchema,
} from "@/modules/products/product.schema";
import {
  createProduct,
  getProductById,
  getProducts,
  updateProduct,
} from "@/modules/products/product.service";
import { idParamSchema } from "@/schema/param";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", async (c) => {
    const products = await getProducts();

    return c.json(success(products));
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const product = await getProductById(id);

    if (!product) {
      return c.json(failure("Product not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(product, "Product retrieved successfully"));
  })
  .post("/", zodValidator("json", POSTProductSchema), async (c) => {
    const body = c.req.valid("json");
    const product = await createProduct(body);

    return c.json(
      success(product, "Create product success"),
      StatusCodes.CREATED
    );
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTProductSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const product = await updateProduct(id, body);

      if (!product) {
        return c.json(failure("Product does not exist"), StatusCodes.NOT_FOUND);
      }

      return c.json(success(product, `Update product ${product.sku} success`));
    }
  );

export default app;
