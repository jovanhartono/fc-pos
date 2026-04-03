import type { InferInsertModel } from "drizzle-orm";
import type { productsTable } from "@/db/schema";
import {
  findProductById,
  insertProduct,
  listProducts,
  updateProductById,
} from "@/modules/products/product.repository";

export function getProducts() {
  return listProducts();
}

export function getProductById(id: number) {
  return findProductById(id);
}

export async function createProduct(
  payload: InferInsertModel<typeof productsTable>
) {
  const [product] = await insertProduct(payload);
  return product;
}

export async function updateProduct(
  id: number,
  payload: Partial<InferInsertModel<typeof productsTable>>
) {
  const [product] = await updateProductById(id, payload);
  return product ?? null;
}
