import type { Counter } from "@fresclean/api/types";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { rpcWithAuth } from "@/lib/rpc";

export type {
	Counter,
	CounterCategory,
	CounterComplaint,
	CounterPickupShelf,
	CounterQcReject,
	CounterStuckItem,
	CounterWorkshop,
} from "@fresclean/api/types";

export const counterKeys = {
	all: ["counter"] as const,
	detail: (storeId: number) => [...counterKeys.all, storeId] as const,
};

async function fetchCounter(storeId: number): Promise<Counter> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.counter.$get({
			query: { store_id: String(storeId) },
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
};
