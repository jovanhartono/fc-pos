import type { InferInsertModel } from "drizzle-orm";
import type { orderServicesImagesTable } from "@/db/schema";
import {
  countOrderServiceImages,
  createOrderServiceImage,
  deleteOrderServiceImage,
  findOrderServiceImageById,
  listOrderServiceImages,
  updateOrderServiceImage,
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

export async function createOrderServiceImageService(
  payload: InferInsertModel<typeof orderServicesImagesTable>
) {
  const [image] = await createOrderServiceImage(payload);
  return image;
}

export async function updateOrderServiceImageService(
  id: number,
  payload: Partial<InferInsertModel<typeof orderServicesImagesTable>>
) {
  const [image] = await updateOrderServiceImage(id, payload);
  return image ?? null;
}

export function deleteOrderServiceImageService(id: number) {
  return deleteOrderServiceImage(id);
}
