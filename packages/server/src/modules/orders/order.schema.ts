import { z } from "zod";
import { orderPaymentStatusEnum, orderStatusEnum } from "@/db/schema";
import { dateStringSchema } from "@/schema/common";
import { normalizePagination } from "@/utils/pagination";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const GETOrdersQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    offset: z.coerce.number().int().min(0).optional(),

    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(orderStatusEnum.enumValues).optional(),
    payment_status: z.enum(orderPaymentStatusEnum.enumValues).optional(),

    // Not a status of its own: ready_for_pickup aged past the shelf window.
    overdue: z.stringbool().optional(),

    customer_id: z.coerce.number().int().positive().optional(),
    store_id: z.coerce.number().int().positive().optional(),
    created_by: z.coerce.number().int().positive().optional(),
    payment_method_id: z.coerce.number().int().positive().optional(),

    date_from: dateStringSchema("date_from").optional(),
    date_to: dateStringSchema("date_to").optional(),

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
  // overdue already pins status to ready_for_pickup, so pairing it with any
  // other status asks for orders that cannot exist. Answering that with an empty
  // list would read as "nothing on the shelf is late" — the one thing the caller
  // must not conclude from a query the shelf never got asked.
  .refine(
    (query) =>
      !(query.overdue && query.status) || query.status === "ready_for_pickup",
    {
      error: "overdue only applies to status=ready_for_pickup",
      path: ["overdue"],
    }
  )
  .optional();

export type GetOrdersQuery = z.infer<typeof GETOrdersQuerySchema>;
type ParsedOrdersQuery = NonNullable<GetOrdersQuery>;

export interface NormalizedOrderListQuery {
  created_by?: number;
  customer_id?: number;
  date_from?: string;
  date_to?: string;
  limit: number;
  offset: number;
  overdue?: boolean;
  payment_method_id?: number;
  payment_status?: ParsedOrdersQuery["payment_status"];
  search?: string;
  sort_by: ParsedOrdersQuery["sort_by"];
  sort_order: ParsedOrdersQuery["sort_order"];
  status?: ParsedOrdersQuery["status"];
  store_id?: number;
}

export type OrderListFilters = Omit<
  NormalizedOrderListQuery,
  "limit" | "offset" | "sort_by" | "sort_order"
>;

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
    overdue: query?.overdue,
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
