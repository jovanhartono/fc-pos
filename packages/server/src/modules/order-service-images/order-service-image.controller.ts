import type { InferInsertModel } from "drizzle-orm";
import type { orderServicesImagesTable } from "@/db/schema";
import type { GetOrderServiceImagesQuery } from "@/modules/order-service-images/order-service-image.schema";
import {
  createOrderServiceImageService,
  deleteOrderServiceImageService,
  getOrderServiceImageById,
  getOrderServiceImages,
  updateOrderServiceImageService,
} from "@/modules/order-service-images/order-service-image.service";

export function getOrderServiceImagesController(
  query?: GetOrderServiceImagesQuery
) {
  return getOrderServiceImages(query);
}

export function getOrderServiceImageByIdController(id: number) {
  return getOrderServiceImageById(id);
}

export function createOrderServiceImageController(
  payload: InferInsertModel<typeof orderServicesImagesTable>
) {
  return createOrderServiceImageService(payload);
}

export function updateOrderServiceImageController(
  id: number,
  payload: Partial<InferInsertModel<typeof orderServicesImagesTable>>
) {
  return updateOrderServiceImageService(id, payload);
}

export function deleteOrderServiceImageController(id: number) {
  return deleteOrderServiceImageService(id);
}
