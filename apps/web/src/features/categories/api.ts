import type { POSTCategorySchema } from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { InferResponseType } from "hono/client";
import type { z } from "zod";

import { REFERENCE_DATA_STALE_TIME } from "@/lib/query-defaults";
import { rpc } from "@/lib/rpc";

export type Category = InferResponseType<
  typeof rpc.api.admin.categories.$get
>["data"][number];

export type CreateCategoryPayload = z.infer<typeof POSTCategorySchema>;
export type UpdateCategoryPayload = z.infer<typeof POSTCategorySchema>;

export const categoriesKeys = {
  all: ["categories"] as const,
  list: () => [...categoriesKeys.all, "list"] as const,
};

const fetchCategories = async () => {
  const response = await parseResponse(rpc.api.admin.categories.$get());
  return response.data;
};

export const categoriesQueries = {
  list: () =>
    queryOptions({
      queryKey: categoriesKeys.list(),
      queryFn: fetchCategories,
      staleTime: REFERENCE_DATA_STALE_TIME,
    }),
};

export const createCategory = (payload: CreateCategoryPayload) =>
  parseResponse(rpc.api.admin.categories.$post({ json: payload }));

export const updateCategory = (id: number, payload: UpdateCategoryPayload) =>
  parseResponse(
    rpc.api.admin.categories[":id"].$put({
      param: { id: String(id) },
      json: payload,
    })
  );
