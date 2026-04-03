import type { InferInsertModel } from "drizzle-orm";
import type { servicesTable } from "@/db/schema";
import {
  findServiceById,
  insertService,
  listServices,
  updateServiceById,
} from "@/modules/services/service.repository";

export function getServices() {
  return listServices();
}

export function getServiceById(id: number) {
  return findServiceById(id);
}

export async function createService(
  payload: InferInsertModel<typeof servicesTable>
) {
  const [service] = await insertService(payload);
  return service;
}

export async function updateService(
  id: number,
  payload: Partial<InferInsertModel<typeof servicesTable>>
) {
  const [service] = await updateServiceById(id, payload);
  return service ?? null;
}
