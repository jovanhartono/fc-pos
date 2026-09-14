import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { NotFoundException } from "@/http-exceptions";
import { assertIsAdmin } from "@/modules/permissions/permissions";
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
import type { AdminEnv } from "@/types/hono";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const products = await getProducts();

    return c.json(success(products));
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const product = await getProductById(id);

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return c.json(success(product));
  })
  .post("/", zodValidator("json", POSTProductSchema), async (c) => {
    assertIsAdmin(c.get("jwtPayload"));
    const body = c.req.valid("json");
    const product = await createProduct(body);

    return c.json(success(product, "Product created"), StatusCodes.CREATED);
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTProductSchema),
    async (c) => {
      assertIsAdmin(c.get("jwtPayload"));
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const product = await updateProduct(id, body);

      if (!product) {
        throw new NotFoundException("Product not found");
      }

      return c.json(success(product, `Update product ${product.sku} success`));
    }
  );

export default app;
