import type { InferInsertModel } from "drizzle-orm";
import type { servicesTable } from "@/db/schema";
import {
  createService,
  findServiceById,
  listServices,
  updateService,
} from "@/modules/services/service.repository";

export function getServices() {
  return listServices();
}

export function getServiceById(id: number) {
  return findServiceById(id);
}

export async function createServiceService(
  payload: InferInsertModel<typeof servicesTable>
) {
  const [service] = await createService(payload);
  return service;
}

export async function updateServiceService(
  id: number,
  payload: Partial<InferInsertModel<typeof servicesTable>>
) {
  const [service] = await updateService(id, payload);
  return service ?? null;
}
