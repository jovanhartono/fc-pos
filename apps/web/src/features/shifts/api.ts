import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import {
	type PaginatedData,
	parseSuccessData,
	toPaginated,
	toSearchParams,
} from "@/lib/http";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type Shift = InferResponseType<
	typeof rpc.api.admin.shifts.$get
>["data"][number];

export type CurrentShift = InferResponseType<
	typeof rpc.api.admin.shifts.current.$get
>["data"];

export type FetchShiftsQuery = {
	user_id?: number;
	store_id?: number;
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
};

export const shiftsKeys = {
	all: ["shifts"] as const,
	lists: () => [...shiftsKeys.all, "list"] as const,
	list: (query?: FetchShiftsQuery) =>
		[...shiftsKeys.lists(), query ?? {}] as const,
	current: () => [...shiftsKeys.all, "current"] as const,
};

async function fetchShifts(
	query?: FetchShiftsQuery,
): Promise<PaginatedData<Shift>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.shifts.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response);
}

function fetchCurrentShift() {
	return parseSuccessData<CurrentShift>(
		rpcWithAuth().api.admin.shifts.current.$get(),
	);
}

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
};

export function clockInShift(payload: { store_id: number }) {
	return parseResponse(
		rpcWithAuth().api.admin.shifts["clock-in"].$post({ json: payload }),
	);
}

export function clockOutShift() {
	return parseResponse(rpcWithAuth().api.admin.shifts["clock-out"].$post());
}
