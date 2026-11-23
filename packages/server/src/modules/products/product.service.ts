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

export const getProducts = () => listProducts();

export const getProductById = (id: number) => findProductById(id);

export const createProduct = async (
  payload: z.infer<typeof POSTProductSchema>
) => {
  const [product] = await insertProduct({
    ...payload,
    cogs: payload.cogs.toString(),
    price: payload.price.toString(),
  });
  return product;
};

export const updateProduct = async (
  id: number,
  payload: z.infer<typeof PUTProductSchema>
) => {
  const { cogs, price, ...rest } = payload;
  const [product] = await updateProductById(id, {
    ...rest,
    ...(cogs === undefined ? {} : { cogs: cogs.toString() }),
    ...(price === undefined ? {} : { price: price.toString() }),
  });
  return product ?? null;
};
