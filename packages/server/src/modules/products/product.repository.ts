import type { InferInsertModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { productsTable } from "@/db/schema";

export function findProducts(ids: number[]) {
  return db.query.productsTable.findMany({
    where: { id: { in: ids } },
  });
}

export function listProducts() {
  return db.query.productsTable.findMany({
    orderBy: { id: "asc" },
    with: {
      category: true,
    },
  });
}

const findProductByIdPrepared = db.query.productsTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_product_by_id");

export function findProductById(id: number) {
  return findProductByIdPrepared.execute({ id });
}

export function insertProduct(values: InferInsertModel<typeof productsTable>) {
  return db.insert(productsTable).values(values).returning();
}

export function updateProductById(
  id: number,
  values: Partial<InferInsertModel<typeof productsTable>>
) {
  return db
    .update(productsTable)
    .set(values)
    .where(eq(productsTable.id, id))
    .returning();
}
