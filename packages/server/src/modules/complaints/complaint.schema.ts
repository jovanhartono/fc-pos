import { z } from "zod";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/modules/orders/order.schema";
import { isInWorkshop } from "@/modules/orders/order-status-machine";
import { normalizePagination } from "@/utils/pagination";

// A finished line (ADR-0013, 2026-09-24): usually turned down at the counter
// while still ready, sometimes brought back after it went home.
export function isComplainableStatus(status: string): boolean {
  return status === "ready_for_pickup" || status === "picked_up";
}

// The customer at the counter is shown the whole pair, so a ready line waits
// until nothing else on its Item is still in the workshop.
export function isComplainableLine(
  line: { status: string },
  itemLines: ReadonlyArray<{ status: string }>
): boolean {
  return (
    line.status === "picked_up" ||
    (line.status === "ready_for_pickup" && !itemLines.some(isInWorkshop))
  );
}

// A cancelled round re-cleaned nothing, so it does not make a Complaint Reworked.
export function isReworkedRound(round: { status: string }): boolean {
  return round.status !== "cancelled";
}

// `start_rework` spawns the first free rework line in the same transaction.
export const POSTComplaintSchema = z.object({
  order_service_id: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
  start_rework: z.boolean().optional().default(false),
});

export const GETComplaintsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    store_id: z.coerce.number().int().positive().optional(),
    search: z.string().trim().min(1).max(100).optional(),
  })
  .optional();

export type PostComplaintInput = z.infer<typeof POSTComplaintSchema>;
export type GetComplaintsQuery = z.infer<typeof GETComplaintsQuerySchema>;

export interface NormalizedComplaintListQuery {
  limit: number;
  offset: number;
  search?: string;
  store_id?: number;
}

export function normalizeComplaintListQuery(
  query?: GetComplaintsQuery
): NormalizedComplaintListQuery {
  const pagination = normalizePagination(query, {
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });

  return {
    limit: pagination.limit,
    offset: pagination.offset,
    search: query?.search,
    store_id: query?.store_id,
  };
}
