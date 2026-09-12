import type { KpiDelta, ReportGranularity } from "@fresclean/api/types";
import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import {
	type PaginatedData,
	parseSuccessData,
	toPaginated,
	toSearchParams,
} from "@/lib/http";
import { REPORT_STALE_TIME } from "@/lib/query-defaults";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type { KpiDelta, ReportGranularity };

export type ReportOverview = InferResponseType<
	typeof rpc.api.admin.reports.overview.$get
>["data"];

export type FinancialReport = InferResponseType<
	typeof rpc.api.admin.reports.financial.$get
>["data"];

export type OrdersFlowReport = InferResponseType<
	(typeof rpc.api.admin.reports)["orders-flow"]["$get"]
>["data"];

export type PaymentMixReport = InferResponseType<
	(typeof rpc.api.admin.reports)["payment-mix"]["$get"]
>["data"];

export type CustomerAcquisitionReport = InferResponseType<
	(typeof rpc.api.admin.reports)["customer-acquisition"]["$get"]
>["data"];

export type RefundTrendReport = InferResponseType<
	(typeof rpc.api.admin.reports)["refund-trend"]["$get"]
>["data"];

export type WorkerProductivityReport = InferResponseType<
	(typeof rpc.api.admin.reports)["worker-productivity"]["$get"]
>["data"];

export type CampaignEffectivenessReport = InferResponseType<
	(typeof rpc.api.admin.reports)["campaign-effectiveness"]["$get"]
>["data"];

export type AgingQueueItem = InferResponseType<
	(typeof rpc.api.admin.reports)["aging-queue"]["$get"]
>["data"][number];

export type FetchReportOverviewQuery = {
	date: string;
	store_id?: number;
	trend_days?: number;
};

export type FetchReportRangeQuery = {
	from: string;
	to: string;
	store_id?: number;
	granularity?: ReportGranularity;
};

export interface FetchAgingQueueQuery {
	store_id?: number;
	limit?: number;
	offset?: number;
}

export const reportsKeys = {
	all: ["reports"] as const,
	overview: (query: FetchReportOverviewQuery) =>
		[...reportsKeys.all, "overview", query] as const,
	financial: (query: FetchReportRangeQuery) =>
		[...reportsKeys.all, "financial", query] as const,
	ordersFlow: (query: FetchReportRangeQuery) =>
		[...reportsKeys.all, "orders-flow", query] as const,
	paymentMix: (query: FetchReportRangeQuery) =>
		[...reportsKeys.all, "payment-mix", query] as const,
	customerAcquisition: (query: FetchReportRangeQuery) =>
		[...reportsKeys.all, "customer-acquisition", query] as const,
	refundTrend: (query: FetchReportRangeQuery) =>
		[...reportsKeys.all, "refund-trend", query] as const,
	workerProductivity: (query: FetchReportRangeQuery) =>
		[...reportsKeys.all, "worker-productivity", query] as const,
	campaignEffectiveness: (query: FetchReportRangeQuery) =>
		[...reportsKeys.all, "campaign-effectiveness", query] as const,
	agingQueue: (query?: FetchAgingQueueQuery) =>
		[...reportsKeys.all, "aging-queue", query ?? {}] as const,
};

function toRangeQuery(query: FetchReportRangeQuery) {
	return {
		from: query.from,
		to: query.to,
		...(query.store_id !== undefined
			? { store_id: String(query.store_id) }
			: {}),
		...(query.granularity ? { granularity: query.granularity } : {}),
	};
}

function fetchReportOverview(query: FetchReportOverviewQuery) {
	return parseSuccessData<ReportOverview>(
		rpcWithAuth().api.admin.reports.overview.$get({
			query: {
				date: query.date,
				...(query.store_id !== undefined
					? { store_id: String(query.store_id) }
					: {}),
				...(query.trend_days !== undefined
					? { trend_days: String(query.trend_days) }
					: {}),
			},
		}),
	);
}

async function fetchAgingQueueReport(
	query?: FetchAgingQueueQuery,
): Promise<PaginatedData<AgingQueueItem>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.reports["aging-queue"].$get({
			query: toSearchParams({
				store_id: query?.store_id,
				limit: query?.limit,
				offset: query?.offset,
			}),
		}),
	);
	return toPaginated(response);
}

export const reportsQueries = {
	overview: (query: FetchReportOverviewQuery) =>
		queryOptions({
			queryKey: reportsKeys.overview(query),
			queryFn: () => fetchReportOverview(query),
			staleTime: REPORT_STALE_TIME,
		}),
	financial: (query: FetchReportRangeQuery) =>
		queryOptions({
			queryKey: reportsKeys.financial(query),
			queryFn: () =>
				parseSuccessData<FinancialReport>(
					rpcWithAuth().api.admin.reports.financial.$get({
						query: toRangeQuery(query),
					}),
				),
			staleTime: REPORT_STALE_TIME,
		}),
	ordersFlow: (query: FetchReportRangeQuery) =>
		queryOptions({
			queryKey: reportsKeys.ordersFlow(query),
			queryFn: () =>
				parseSuccessData<OrdersFlowReport>(
					rpcWithAuth().api.admin.reports["orders-flow"].$get({
						query: toRangeQuery(query),
					}),
				),
			staleTime: REPORT_STALE_TIME,
		}),
	paymentMix: (query: FetchReportRangeQuery) =>
		queryOptions({
			queryKey: reportsKeys.paymentMix(query),
			queryFn: () =>
				parseSuccessData<PaymentMixReport>(
					rpcWithAuth().api.admin.reports["payment-mix"].$get({
						query: toRangeQuery(query),
					}),
				),
			staleTime: REPORT_STALE_TIME,
		}),
	customerAcquisition: (query: FetchReportRangeQuery) =>
		queryOptions({
			queryKey: reportsKeys.customerAcquisition(query),
			queryFn: () =>
				parseSuccessData<CustomerAcquisitionReport>(
					rpcWithAuth().api.admin.reports["customer-acquisition"].$get({
						query: toRangeQuery(query),
					}),
				),
			staleTime: REPORT_STALE_TIME,
		}),
	refundTrend: (query: FetchReportRangeQuery) =>
		queryOptions({
			queryKey: reportsKeys.refundTrend(query),
			queryFn: () =>
				parseSuccessData<RefundTrendReport>(
					rpcWithAuth().api.admin.reports["refund-trend"].$get({
						query: toRangeQuery(query),
					}),
				),
			staleTime: REPORT_STALE_TIME,
		}),
	workerProductivity: (query: FetchReportRangeQuery) =>
		queryOptions({
			queryKey: reportsKeys.workerProductivity(query),
			queryFn: () =>
				parseSuccessData<WorkerProductivityReport>(
					rpcWithAuth().api.admin.reports["worker-productivity"].$get({
						query: toRangeQuery(query),
					}),
				),
			staleTime: REPORT_STALE_TIME,
		}),
	campaignEffectiveness: (query: FetchReportRangeQuery) =>
		queryOptions({
			queryKey: reportsKeys.campaignEffectiveness(query),
			queryFn: () =>
				parseSuccessData<CampaignEffectivenessReport>(
					rpcWithAuth().api.admin.reports["campaign-effectiveness"].$get({
						query: toRangeQuery(query),
					}),
				),
			staleTime: REPORT_STALE_TIME,
		}),
	agingQueue: (query?: FetchAgingQueueQuery) =>
		queryOptions({
			queryKey: reportsKeys.agingQueue(query),
			queryFn: () => fetchAgingQueueReport(query),
			staleTime: REPORT_STALE_TIME,
		}),
};
