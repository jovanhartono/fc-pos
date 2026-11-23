import type { POSTServiceSchema } from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { InferResponseType } from "hono/client";
import type { z } from "zod";

import { REFERENCE_DATA_STALE_TIME } from "@/lib/query-defaults";
import { rpc } from "@/lib/rpc";

export type Service = InferResponseType<
  typeof rpc.api.admin.services.$get
>["data"][number];

// Prices travel as the digit string the price field typed and the server turns
// them into numbers, so payloads take the schema's input side.
export type CreateServicePayload = z.input<typeof POSTServiceSchema>;
export type UpdateServicePayload = z.input<typeof POSTServiceSchema>;

export const servicesKeys = {
  all: ["services"] as const,
  list: () => [...servicesKeys.all, "list"] as const,
};

const fetchServices = async () => {
  const response = await parseResponse(rpc.api.admin.services.$get());
  return response.data;
};

export const servicesQueries = {
  list: () =>
    queryOptions({
      queryKey: servicesKeys.list(),
      queryFn: fetchServices,
      staleTime: REFERENCE_DATA_STALE_TIME,
    }),
};

export const createService = (payload: CreateServicePayload) =>
  parseResponse(rpc.api.admin.services.$post({ json: payload }));

export const updateService = (id: number, payload: UpdateServicePayload) =>
  parseResponse(
    rpc.api.admin.services[":id"].$put({
      param: { id: String(id) },
      json: payload,
    })
  );
