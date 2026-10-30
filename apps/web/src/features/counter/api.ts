import type {
	Counter,
	CounterShelfOrder,
	DayClose,
} from "@fresclean/api/types";
import {
	infiniteQueryOptions,
	keepPreviousData,
	queryOptions,
} from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { type PaginatedData, toPaginated } from "@/lib/http";
import { REPORT_STALE_TIME } from "@/lib/query-defaults";
import { rpcWithAuth } from "@/lib/rpc";
import { jakartaToday } from "@/shared/date-presets";

export type {
	Counter,
	CounterCategory,
	CounterComplaint,
	CounterPickupShelf,
	CounterQcReject,
	CounterShelfOrder,
	CounterWorkshop,
	DayClose,
	DayCloseCategory,
	DayCloseCollected,
	DayCloseMethod,
	DayCloseOrder,
	DayClosePayment,
	DayClosePickedUpOrder,
	DayCloseRefund,
} from "@fresclean/api/types";

export const counterKeys = {
	all: ["counter"] as const,
	detail: (storeId: number) => [...counterKeys.all, storeId] as const,
	dayClose: (storeId: number, date: string) =>
		[...counterKeys.detail(storeId), "day-close", date] as const,
	pickupShelf: (storeId: number) =>
		[...counterKeys.detail(storeId), "pickup-shelf"] as const,
};

async function fetchPickupShelfPage(
	storeId: number,
	offset: number,
): Promise<PaginatedData<CounterShelfOrder>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.counter["pickup-shelf"].$get({
			query: { store_id: String(storeId), offset: String(offset) },
		}),
	);
	return toPaginated(response);
}

async function fetchCounter(storeId: number): Promise<Counter> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.counter.$get({
			query: { store_id: String(storeId) },
		}),
	);
	return response.data;
}

async function fetchDayClose(storeId: number, date: string): Promise<DayClose> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.counter["day-close"].$get({
			query: { store_id: String(storeId), date },
		}),
	);
	return response.data;
}

// A cashier leaves this open on the iPad all day, so it refreshes itself;
// coming back to the tab refreshes it too, by TanStack's default.
export const counterQueries = {
	detail: (storeId: number) =>
		queryOptions({
			queryKey: counterKeys.detail(storeId),
			queryFn: () => fetchCounter(storeId),
			refetchInterval: 60_000,
		}),
	pickupShelf: (storeId: number) =>
		infiniteQueryOptions({
			queryKey: counterKeys.pickupShelf(storeId),
			// Same as the Queue: a deep scroll comes back as one page, not all of them.
			gcTime: 5 * 60 * 1000,
			initialPageParam: 0,
			queryFn: ({ pageParam }) => fetchPickupShelfPage(storeId, pageParam),
			getNextPageParam: (lastPage) => {
				const nextOffset = lastPage.meta.offset + lastPage.meta.limit;
				return nextOffset < lastPage.meta.total ? nextOffset : undefined;
			},
			refetchInterval: 60_000,
		}),
	// Today's close grows with every payment; a past day never changes.
	dayClose: (storeId: number, date: string) => {
		const isToday = date === jakartaToday();
		return queryOptions({
			queryKey: counterKeys.dayClose(storeId, date),
			queryFn: () => fetchDayClose(storeId, date),
			refetchInterval: isToday ? 60_000 : false,
			staleTime: isToday ? 0 : REPORT_STALE_TIME,
			placeholderData: keepPreviousData,
		});
	},
};
