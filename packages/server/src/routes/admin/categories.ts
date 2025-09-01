import { asc, eq } from "drizzle-orm";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { db } from "@/db";
import { categoriesTable } from "@/db/schema";
import { notFoundOrFirst } from "@/utils/helper";
import { failure, success } from "@/utils/http";
import { idParamSchema } from "@/utils/schema";
import { CategoryWhereBuilder } from "@/utils/where-clause-utils";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const POSTCategorySchema = createInsertSchema(categoriesTable);
const PUTCategorySchema = createUpdateSchema(categoriesTable);

const categoriesQuerySchema = z
  .object({ is_active: z.coerce.boolean().optional() })
  .optional();

const app = new Hono()
  .get("/", zodValidator("query", categoriesQuerySchema), async (c) => {
    const query = c.req.valid("query") || {};
    const { is_active } = query;
    const whereClause = new CategoryWhereBuilder().isActive(is_active).build();

    const categories = await db.query.categoriesTable.findMany({
      orderBy: [asc(categoriesTable.id)],
      where: whereClause,
    });

    return c.json(success(categories));
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const category = await db.query.categoriesTable.findFirst({
      where: eq(categoriesTable.id, id),
    });

    if (!category) {
      return c.json(failure("Category not found", StatusCodes.NOT_FOUND));
    }

    return c.json(success(category, "Category retrieved successfully"));
  })
  .post("/", zodValidator("json", POSTCategorySchema), async (c) => {
    const body = c.req.valid("json");

    const [category] = await db
      .insert(categoriesTable)
      .values(body)
      .returning();

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

      const updatedCategory = await db
        .update(categoriesTable)
        .set(body)
        .where(eq(categoriesTable.id, id))
        .returning();

      const category = notFoundOrFirst(
        updatedCategory,
        c,
        "Category does not exist"
      );
      if (category instanceof Response) {
        return category;
      }

      return c.json(
        success(category, `Update Category ${category.name} success`)
      );
    }
  );

export default app;
