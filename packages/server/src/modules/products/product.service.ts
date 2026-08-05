import type z from "zod";
import {
  findProductById,
  insertProduct,
  listProducts,
  updateProductById,
} from "@/modules/products/product.repository";
import type {
  POSTProductSchema,
  PUTProductSchema,
} from "@/modules/products/product.schema";

export function getProducts() {
  return listProducts();
}

export function getProductById(id: number) {
  return findProductById(id);
}

export async function createProduct(
  payload: z.infer<typeof POSTProductSchema>
) {
  const [product] = await insertProduct({
    ...payload,
    cogs: payload.cogs.toString(),
    price: payload.price.toString(),
  });
  return product;
}

export async function updateProduct(
  id: number,
  payload: z.infer<typeof PUTProductSchema>
) {
  const { cogs, price, ...rest } = payload;
  const [product] = await updateProductById(id, {
    ...rest,
    ...(cogs === undefined ? {} : { cogs: cogs.toString() }),
    ...(price === undefined ? {} : { price: price.toString() }),
  });
  return product ?? null;
}
