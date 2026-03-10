import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  createCategoryController,
  getCategoriesController,
  getCategoryByIdController,
  updateCategoryController,
} from "@/modules/categories/category.controller";
import {
  GETCategoriesQuerySchema,
  POSTCategorySchema,
  PUTCategorySchema,
} from "@/modules/categories/category.schema";
import { idParamSchema } from "@/schema/param";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", zodValidator("query", GETCategoriesQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const categories = await getCategoriesController(query);

    return c.json(success(categories));
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const category = await getCategoryByIdController(id);

    if (!category) {
      return c.json(failure("Category not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(category, "Category retrieved successfully"));
  })
  .post("/", zodValidator("json", POSTCategorySchema), async (c) => {
    const body = c.req.valid("json");

    const category = await createCategoryController(body);

    return c.json(
      success(category, "Create category success"),
      StatusCodes.CREATED
    );
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTCategorySchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const category = await updateCategoryController(id, body);

      if (!category) {
        return c.json(
          failure("Category does not exist"),
          StatusCodes.NOT_FOUND
        );
      }

      return c.json(
        success(category, `Update Category ${category.name} success`)
      );
    }
  );

export default app;
