import type z from "zod";
import {
  findServiceById,
  insertService,
  listServices,
  updateServiceById,
} from "@/modules/services/service.repository";
import type {
  POSTServiceSchema,
  PUTServiceSchema,
} from "@/modules/services/service.schema";

export function getServices() {
  return listServices();
}

export function getServiceById(id: number) {
  return findServiceById(id);
}

export async function createService(
  payload: z.infer<typeof POSTServiceSchema>
) {
  const [service] = await insertService({
    ...payload,
    cogs: payload.cogs.toString(),
    // null = no list price (Repair) — stored as NULL, never coerced to "0".
    price: payload.price === null ? null : payload.price.toString(),
  });
  return service;
}

export async function updateService(
  id: number,
  payload: z.infer<typeof PUTServiceSchema>
) {
  const { cogs, price, ...rest } = payload;
  const [service] = await updateServiceById(id, {
    ...rest,
    ...(cogs === undefined ? {} : { cogs: cogs.toString() }),
    ...(price === undefined
      ? {}
      : { price: price === null ? null : price.toString() }),
  });
  return service ?? null;
}
