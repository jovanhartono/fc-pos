import type { InferInsertModel } from "drizzle-orm";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { productsTable } from "@/db/schema";
import type { OrderTx } from "@/modules/orders/order.repository";

// The whole basket in one statement. Each product keeps its own guard, so a
// shelf that cannot cover one line leaves that row untouched and out of the
// returned ids — which is how the caller knows what to hand back.
export function decrementProductsStock(
  tx: OrderTx,
  entries: { productId: number; qty: number }[]
) {
  const wanted = sql.join(
    entries.map(
      (entry) => sql`(${entry.productId}::integer, ${entry.qty}::integer)`
    ),
    sql`, `
  );

  return tx
    .update(productsTable)
    .set({ stock: sql`${productsTable.stock} - wanted.qty` })
    .from(sql`(values ${wanted}) as wanted(product_id, qty)`)
    .where(
      and(
        eq(productsTable.id, sql`wanted.product_id`),
        gte(productsTable.stock, sql`wanted.qty`)
      )
    )
    .returning({ id: productsTable.id });
}

// Second stock writer (ADR-0008): cancelling an unpaid product line restores
// stock — the goods never left the shop, unlike a refund.
export function incrementProductStock(
  tx: OrderTx,
  productId: number,
  qty: number
) {
  return tx
    .update(productsTable)
    .set({ stock: sql`${productsTable.stock} + ${qty}` })
    .where(eq(productsTable.id, productId))
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
