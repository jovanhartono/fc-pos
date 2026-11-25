import type { ClockInCoordinates } from "@fresclean/api/rules";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { InferResponseType } from "hono/client";

import { parseSuccessData, toPaginated, toSearchParams } from "@/lib/http";
import type { PaginatedData } from "@/lib/http";
import { REPORT_STALE_TIME } from "@/lib/query-defaults";
import { rpc } from "@/lib/rpc";

export type Shift = InferResponseType<
  typeof rpc.api.admin.shifts.$get
>["data"][number];

export type CurrentShift = InferResponseType<
  typeof rpc.api.admin.shifts.current.$get
>["data"];

export interface FetchShiftsQuery {
  user_id?: number;
  store_id?: number;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export type ShiftsOverview = InferResponseType<
  typeof rpc.api.admin.shifts.overview.$get
>["data"];

export type ShiftPerson = ShiftsOverview["people"][number];
export type ShiftDay = ShiftsOverview["days"][number];

export interface FetchShiftsOverviewQuery {
  from: string;
  to: string;
  store_id?: number;
}

export interface FetchWorkerShiftsQuery {
  user_id: number;
  store_id: number;
  from: string;
  to: string;
}

export const shiftsKeys = {
  all: ["shifts"] as const,
  lists: () => [...shiftsKeys.all, "list"] as const,
  list: (query?: FetchShiftsQuery) =>
    [...shiftsKeys.lists(), query ?? {}] as const,
  current: () => [...shiftsKeys.all, "current"] as const,
  overview: (query: FetchShiftsOverviewQuery) =>
    [...shiftsKeys.all, "overview", query] as const,
  ofWorker: (query: FetchWorkerShiftsQuery) =>
    [...shiftsKeys.all, "worker", query] as const,
};

const fetchShiftsOverview = (query: FetchShiftsOverviewQuery) =>
  parseSuccessData<ShiftsOverview>(
    rpc.api.admin.shifts.overview.$get({
      query: { ...toSearchParams(query), from: query.from, to: query.to },
    })
  );

const WORKER_PAGE_SIZE = 100;

const fetchShifts = async (
  query?: FetchShiftsQuery
): Promise<PaginatedData<Shift>> => {
  const response = await parseResponse(
    rpc.api.admin.shifts.$get({
      query:
        query && Object.keys(query).length > 0
          ? toSearchParams(query)
          : undefined,
    })
  );

  return toPaginated(response);
};

// Ninety days of someone doubling up can run past one page, and the sheet
// lists every Shift the meal fee is counted from.
const fetchWorkerShifts = async (query: FetchWorkerShiftsQuery) => {
  const shifts: Shift[] = [];
  for (;;) {
    const page = await fetchShifts({
      ...query,
      limit: WORKER_PAGE_SIZE,
      offset: shifts.length,
    });
    shifts.push(...page.items);
    if (page.items.length === 0 || shifts.length >= page.meta.total) {
      return shifts;
    }
  }
};

const fetchCurrentShift = () =>
  parseSuccessData<CurrentShift>(rpc.api.admin.shifts.current.$get());

export const shiftsQueries = {
  list: (query?: FetchShiftsQuery) =>
    queryOptions({
      queryKey: shiftsKeys.list(query),
      queryFn: () => fetchShifts(query),
    }),
  current: () =>
    queryOptions({
      queryKey: shiftsKeys.current(),
      queryFn: fetchCurrentShift,
    }),
  overview: (query: FetchShiftsOverviewQuery) =>
    queryOptions({
      queryKey: shiftsKeys.overview(query),
      queryFn: () => fetchShiftsOverview(query),
      staleTime: REPORT_STALE_TIME,
    }),
  ofWorker: (query: FetchWorkerShiftsQuery) =>
    queryOptions({
      queryKey: shiftsKeys.ofWorker(query),
      queryFn: () => fetchWorkerShifts(query),
    }),
};

export const clockInShift = (payload: {
  store_id: number;
  coordinates?: ClockInCoordinates;
}) => parseResponse(rpc.api.admin.shifts["clock-in"].$post({ json: payload }));

export const clockOutShift = () =>
  parseResponse(rpc.api.admin.shifts["clock-out"].$post());

export interface UpdateShiftPayload {
  clock_in_at: string;
  clock_out_at?: string;
  store_id: number;
}

export interface CreateShiftPayload extends Required<UpdateShiftPayload> {
  user_id: number;
}

export const createShift = (payload: CreateShiftPayload) =>
  parseResponse(rpc.api.admin.shifts.$post({ json: payload }));

export const updateShift = (id: number, payload: UpdateShiftPayload) =>
  parseResponse(
    rpc.api.admin.shifts[":id"].$patch({
      param: { id: String(id) },
      json: payload,
    })
  );

export const deleteShift = (id: number) =>
  parseResponse(
    rpc.api.admin.shifts[":id"].$delete({
      param: { id: String(id) },
    })
  );
