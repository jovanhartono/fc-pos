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

export const getServices = () => listServices();

export const getServiceById = (id: number) => findServiceById(id);

export const createService = async (
  payload: z.infer<typeof POSTServiceSchema>
) => {
  const [service] = await insertService({
    ...payload,
    cogs: payload.cogs.toString(),
    // A Repair has no list price; "0" would make it free.
    price: payload.price === null ? null : payload.price.toString(),
  });
  return service;
};

export const updateService = async (
  id: number,
  payload: z.infer<typeof PUTServiceSchema>
) => {
  const { cogs, price, ...rest } = payload;
  const [service] = await updateServiceById(id, {
    ...rest,
    ...(cogs === undefined ? {} : { cogs: cogs.toString() }),
    ...(price === undefined
      ? {}
      : { price: price === null ? null : price.toString() }),
  });
  return service ?? null;
};
