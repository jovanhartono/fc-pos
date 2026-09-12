import { queryOptions } from "@tanstack/react-query";
import {
	type FetchOrdersQuery,
	fetchOrderDetail,
	fetchOrderServiceQueueCounts,
	fetchOrdersPage,
	queryKeys,
} from "@/lib/api";

export const ordersPageQueryOptions = (query?: FetchOrdersQuery) =>
	queryOptions({
		queryKey: queryKeys.orders(query),
		queryFn: () => fetchOrdersPage(query),
	});

export const orderServiceQueueCountsQueryOptions = (storeId?: number) =>
	queryOptions({
		queryKey: queryKeys.orderServiceQueueCounts(storeId),
		queryFn: () => fetchOrderServiceQueueCounts(storeId),
	});

export const orderDetailQueryOptions = (id: number) =>
	queryOptions({
		queryKey: queryKeys.orderDetail(id),
		queryFn: () => fetchOrderDetail(id),
	});
