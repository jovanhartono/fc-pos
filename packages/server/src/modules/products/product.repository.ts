import { db } from "@/db";

export function findProducts(ids: number[]) {
  return db.query.productsTable.findMany({
    where: (product, { inArray }) => inArray(product.id, ids),
  });
}
