import type { InferInsertModel } from "drizzle-orm";
import type { productsTable } from "@/db/schema";
import {
  createProductService,
  getProductById,
  getProducts,
  updateProductService,
} from "@/modules/products/product.service";

export function getProductsController() {
  return getProducts();
}

export function getProductByIdController(id: number) {
  return getProductById(id);
}

export function createProductController(
  payload: InferInsertModel<typeof productsTable>
) {
  return createProductService(payload);
}

export function updateProductController(
  id: number,
  payload: Partial<InferInsertModel<typeof productsTable>>
) {
  return updateProductService(id, payload);
}
