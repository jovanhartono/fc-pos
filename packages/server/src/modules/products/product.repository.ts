import type { InferInsertModel } from "drizzle-orm";
import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { productsTable } from "@/db/schema";
import type { OrderTx } from "@/modules/orders/order.repository";

// A Product short on stock is left untouched and missing from the returned
// ids, which is how the caller knows which Line to refuse.
export const decrementProductsStock = (
  tx: OrderTx,
  entries: { productId: number; qty: number }[]
) => {
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
};

// A Cancellation puts stock back (ADR-0008): the goods never left the shop,
// unlike after a Refund.
export const incrementProductStock = (
  tx: OrderTx,
  productId: number,
  qty: number
) =>
  tx
    .update(productsTable)
    .set({ stock: sql`${productsTable.stock} + ${qty}` })
    .where(eq(productsTable.id, productId))
    .returning({ id: productsTable.id });

export const findProducts = (ids: number[]) =>
  db.query.productsTable.findMany({
    where: { id: { in: ids } },
  });

export const LIST_PRODUCTS_MAX = 500;

export const listProducts = () =>
  db.query.productsTable.findMany({
    orderBy: { id: "asc" },
    limit: LIST_PRODUCTS_MAX,
    with: {
      category: true,
    },
  });

const findProductByIdPrepared = db.query.productsTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_product_by_id");

export const findProductById = (id: number) =>
  findProductByIdPrepared.execute({ id });

export const insertProduct = (values: InferInsertModel<typeof productsTable>) =>
  db.insert(productsTable).values(values).returning();

export const updateProductById = (
  id: number,
  values: Partial<InferInsertModel<typeof productsTable>>
) =>
  db
    .update(productsTable)
    .set(values)
    .where(eq(productsTable.id, id))
    .returning();
