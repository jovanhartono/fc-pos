import type { InferInsertModel } from "drizzle-orm";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productsTable } from "@/db/schema";

export function findProducts(ids: number[]) {
  return db.query.productsTable.findMany({
    where: (product, { inArray }) => inArray(product.id, ids),
  });
}

export function listProducts() {
  return db.query.productsTable.findMany({
    orderBy: [asc(productsTable.id)],
    with: {
      category: true,
    },
  });
}

export function findProductById(id: number) {
  return db.query.productsTable.findFirst({
    where: eq(productsTable.id, id),
  });
}

export function createProduct(values: InferInsertModel<typeof productsTable>) {
  return db.insert(productsTable).values(values).returning();
}

export function updateProduct(
  id: number,
  values: Partial<InferInsertModel<typeof productsTable>>
) {
  return db
    .update(productsTable)
    .set(values)
    .where(eq(productsTable.id, id))
    .returning();
}
