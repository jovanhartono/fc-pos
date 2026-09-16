import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type PostalCode = InferResponseType<
	(typeof rpc.api.admin)["postal-codes"]["$get"]
>["data"][number];

export const postalCodesKeys = {
	all: ["postal-codes"] as const,
	list: (search: string) => [...postalCodesKeys.all, "list", search] as const,
};

async function fetchPostalCodes(search: string) {
	const response = await parseResponse(
		rpcWithAuth().api.admin["postal-codes"].$get({ query: { search } }),
	);
	return response.data;
}

export const postalCodesQueries = {
	list: (search: string) =>
		queryOptions({
			queryKey: postalCodesKeys.list(search),
			queryFn: () => fetchPostalCodes(search),
			enabled: search.length > 0,
			// The kode pos list never changes, so a repeated search is free.
			staleTime: Number.POSITIVE_INFINITY,
		}),
};
