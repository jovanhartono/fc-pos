import { z } from "zod";
import { orderPaymentStatusEnum, orderStatusEnum } from "@/db/schema";
import { normalizePagination } from "@/utils/pagination";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const GETOrdersQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    offset: z.coerce.number().int().min(0).optional(),

    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(orderStatusEnum.enumValues).optional(),
    payment_status: z.enum(orderPaymentStatusEnum.enumValues).optional(),

    customer_id: z.coerce.number().int().positive().optional(),
    store_id: z.coerce.number().int().positive().optional(),
    created_by: z.coerce.number().int().positive().optional(),
    payment_method_id: z.coerce.number().int().positive().optional(),

    date_from: z
      .string()
      .regex(dateRegex, "date_from must use YYYY-MM-DD format")
      .optional(),
    date_to: z
      .string()
      .regex(dateRegex, "date_to must use YYYY-MM-DD format")
      .optional(),

    sort_by: z.enum(["created_at", "code", "id", "total"]).default("id"),
    sort_order: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (query) =>
      !(query.date_from && query.date_to) || query.date_from <= query.date_to,
    {
      error: "date_from must be less than or equal to date_to",
      path: ["date_from"],
    }
  )
  .optional();

export type GetOrdersQuery = z.infer<typeof GETOrdersQuerySchema>;
type ParsedOrdersQuery = NonNullable<GetOrdersQuery>;

export interface NormalizedOrderListQuery {
  limit: number;
  offset: number;
  search?: string;
  status?: ParsedOrdersQuery["status"];
  payment_status?: ParsedOrdersQuery["payment_status"];
  customer_id?: number;
  store_id?: number;
  created_by?: number;
  payment_method_id?: number;
  date_from?: string;
  date_to?: string;
  sort_by: ParsedOrdersQuery["sort_by"];
  sort_order: ParsedOrdersQuery["sort_order"];
}

export function normalizeOrderListQuery(
  query?: GetOrdersQuery
): NormalizedOrderListQuery {
  const pagination = normalizePagination(query, {
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });

  return {
    limit: pagination.limit,
    offset: pagination.offset,
    search: query?.search,
    status: query?.status,
    payment_status: query?.payment_status,
    customer_id: query?.customer_id,
    store_id: query?.store_id,
    created_by: query?.created_by,
    payment_method_id: query?.payment_method_id,
    date_from: query?.date_from,
    date_to: query?.date_to,
    sort_by: query?.sort_by ?? "id",
    sort_order: query?.sort_order ?? "desc",
  };
}
