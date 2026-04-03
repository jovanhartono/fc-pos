import type { InferInsertModel } from "drizzle-orm";
import type { orderServicesImagesTable } from "@/db/schema";
import {
  countOrderServiceImages,
  deleteOrderServiceImageById,
  findOrderServiceImageById,
  insertOrderServiceImage,
  listOrderServiceImages,
  updateOrderServiceImageById,
} from "@/modules/order-service-images/order-service-image.repository";
import type { GetOrderServiceImagesQuery } from "@/modules/order-service-images/order-service-image.schema";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";

export async function getOrderServiceImages(
  query?: GetOrderServiceImagesQuery
) {
  const pagination = normalizePagination(query, { maxPageSize: 100 });
  const filters = { order_service_id: query?.order_service_id };

  const [items, total] = await Promise.all([
    listOrderServiceImages({
      filters,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    countOrderServiceImages(filters),
  ]);

  return {
    items,
    meta: buildPaginationMeta(total, pagination),
  };
}

export function getOrderServiceImageById(id: number) {
  return findOrderServiceImageById(id);
}

export async function createOrderServiceImage(
  payload: InferInsertModel<typeof orderServicesImagesTable>
) {
  const [image] = await insertOrderServiceImage(payload);
  return image;
}

export async function updateOrderServiceImage(
  id: number,
  payload: Partial<InferInsertModel<typeof orderServicesImagesTable>>
) {
  const [image] = await updateOrderServiceImageById(id, payload);
  return image ?? null;
}

export function deleteOrderServiceImage(id: number) {
  return deleteOrderServiceImageById(id);
}
