import type { InferInsertModel } from "drizzle-orm";
import type { servicesTable } from "@/db/schema";
import {
  createServiceService,
  getServiceById,
  getServices,
  updateServiceService,
} from "@/modules/services/service.service";

export function getServicesController() {
  return getServices();
}

export function getServiceByIdController(id: number) {
  return getServiceById(id);
}

export function createServiceController(
  payload: InferInsertModel<typeof servicesTable>
) {
  return createServiceService(payload);
}

export function updateServiceController(
  id: number,
  payload: Partial<InferInsertModel<typeof servicesTable>>
) {
  return updateServiceService(id, payload);
}
