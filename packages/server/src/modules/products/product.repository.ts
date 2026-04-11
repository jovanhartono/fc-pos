import type { InferInsertModel } from "drizzle-orm";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { productsTable } from "@/db/schema";
import type { OrderTx } from "@/modules/orders/order.repository";

export function decrementProductStock(
  tx: OrderTx,
  productId: number,
  qty: number
) {
  return tx
    .update(productsTable)
    .set({ stock: sql`${productsTable.stock} - ${qty}` })
    .where(and(eq(productsTable.id, productId), gte(productsTable.stock, qty)))
    .returning({ id: productsTable.id });
}

export function findProducts(ids: number[]) {
  return db.query.productsTable.findMany({
    where: { id: { in: ids } },
  });
}

export const LIST_PRODUCTS_MAX = 500;

export function listProducts() {
  return db.query.productsTable.findMany({
    orderBy: { id: "asc" },
    limit: LIST_PRODUCTS_MAX,
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
