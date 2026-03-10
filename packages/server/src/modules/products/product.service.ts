import type { InferInsertModel } from "drizzle-orm";
import type { productsTable } from "@/db/schema";
import {
  createProduct,
  findProductById,
  listProducts,
  updateProduct,
} from "@/modules/products/product.repository";

export function getProducts() {
  return listProducts();
}

export function getProductById(id: number) {
  return findProductById(id);
}

export async function createProductService(
  payload: InferInsertModel<typeof productsTable>
) {
  const [product] = await createProduct(payload);
  return product;
}

export async function updateProductService(
  id: number,
  payload: Partial<InferInsertModel<typeof productsTable>>
) {
  const [product] = await updateProduct(id, payload);
  return product ?? null;
}
