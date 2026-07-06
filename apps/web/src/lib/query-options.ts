import { queryOptions } from "@tanstack/react-query";
import {
	type FetchAgingQueueQuery,
	type FetchCampaignsQuery,
	type FetchComplaintsQuery,
	type FetchCustomersQuery,
	type FetchOrdersQuery,
	type FetchReportOverviewQuery,
	type FetchReportRangeQuery,
	type FetchShiftsQuery,
	type FetchUsersQuery,
	fetchAgingQueueReport,
	fetchCampaignEffectivenessReport,
	fetchCampaigns,
	fetchCampaignVoucherCodes,
	fetchCategories,
	fetchComplaintDetail,
	fetchComplaintsPage,
	fetchCurrentShift,
	fetchCustomerAcquisitionReport,
	fetchCustomersPage,
	fetchFinancialReport,
	fetchMe,
	fetchOrderDetail,
	fetchOrdersFlowReport,
	fetchOrdersPage,
	fetchPaymentMethods,
	fetchPaymentMixReport,
	fetchProducts,
	fetchRefundTrendReport,
	fetchReportOverview,
	fetchServices,
	fetchShifts,
	fetchStores,
	fetchUsersPage,
	fetchWorkerProductivityReport,
	queryKeys,
} from "@/lib/api";

const REFERENCE_DATA_STALE_TIME = 5 * 60 * 1000;

export const customersPageQueryOptions = (query?: FetchCustomersQuery) =>
	queryOptions({
		queryKey: queryKeys.customers(query),
		queryFn: () => fetchCustomersPage(query),
	});

export const usersPageQueryOptions = (query?: FetchUsersQuery) =>
	queryOptions({
		queryKey: queryKeys.users(query),
		queryFn: () => fetchUsersPage(query),
	});

export const meQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.me,
		queryFn: fetchMe,
	});

export const storesQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.stores,
		queryFn: fetchStores,
		staleTime: REFERENCE_DATA_STALE_TIME,
	});

export const categoriesQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.categories,
		queryFn: fetchCategories,
		staleTime: REFERENCE_DATA_STALE_TIME,
	});

export const servicesQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.services,
		queryFn: fetchServices,
		staleTime: REFERENCE_DATA_STALE_TIME,
	});

export const productsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.products,
		queryFn: fetchProducts,
		staleTime: REFERENCE_DATA_STALE_TIME,
	});

export const paymentMethodsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.paymentMethods,
		queryFn: fetchPaymentMethods,
		staleTime: REFERENCE_DATA_STALE_TIME,
	});

export const ordersPageQueryOptions = (query?: FetchOrdersQuery) =>
	queryOptions({
		queryKey: queryKeys.orders(query),
		queryFn: () => fetchOrdersPage(query),
	});

export const orderDetailQueryOptions = (id: number) =>
	queryOptions({
		queryKey: queryKeys.orderDetail(id),
		queryFn: () => fetchOrderDetail(id),
	});

export const campaignsQueryOptions = (query?: FetchCampaignsQuery) =>
	queryOptions({
		queryKey: queryKeys.campaigns(query),
		queryFn: () => fetchCampaigns(query),
	});

export const campaignVoucherCodesQueryOptions = (campaignId: number) =>
	queryOptions({
		queryKey: queryKeys.campaignVoucherCodes(campaignId),
		queryFn: () => fetchCampaignVoucherCodes(campaignId),
	});

export const complaintsPageQueryOptions = (query?: FetchComplaintsQuery) =>
	queryOptions({
		queryKey: queryKeys.complaints(query),
		queryFn: () => fetchComplaintsPage(query),
	});

export const complaintDetailQueryOptions = (id: number) =>
	queryOptions({
		queryKey: queryKeys.complaintDetail(id),
		queryFn: () => fetchComplaintDetail(id),
	});

export const currentShiftQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.shiftCurrent,
		queryFn: fetchCurrentShift,
	});

export const shiftsQueryOptions = (query?: FetchShiftsQuery) =>
	queryOptions({
		queryKey: queryKeys.shifts(query),
		queryFn: () => fetchShifts(query),
	});

export const reportOverviewQueryOptions = (query: FetchReportOverviewQuery) =>
	queryOptions({
		queryKey: queryKeys.reportOverview(query),
		queryFn: () => fetchReportOverview(query),
	});

export const financialQueryOptions = (query: FetchReportRangeQuery) =>
	queryOptions({
		queryKey: queryKeys.financial(query),
		queryFn: () => fetchFinancialReport(query),
	});

export const ordersFlowQueryOptions = (query: FetchReportRangeQuery) =>
	queryOptions({
		queryKey: queryKeys.ordersFlow(query),
		queryFn: () => fetchOrdersFlowReport(query),
	});

export const paymentMixQueryOptions = (query: FetchReportRangeQuery) =>
	queryOptions({
		queryKey: queryKeys.paymentMix(query),
		queryFn: () => fetchPaymentMixReport(query),
	});

export const customerAcquisitionQueryOptions = (query: FetchReportRangeQuery) =>
	queryOptions({
		queryKey: queryKeys.customerAcquisition(query),
		queryFn: () => fetchCustomerAcquisitionReport(query),
	});

export const refundTrendQueryOptions = (query: FetchReportRangeQuery) =>
	queryOptions({
		queryKey: queryKeys.refundTrend(query),
		queryFn: () => fetchRefundTrendReport(query),
	});

export const workerProductivityQueryOptions = (query: FetchReportRangeQuery) =>
	queryOptions({
		queryKey: queryKeys.workerProductivity(query),
		queryFn: () => fetchWorkerProductivityReport(query),
	});

export const campaignEffectivenessQueryOptions = (
	query: FetchReportRangeQuery,
) =>
	queryOptions({
		queryKey: queryKeys.campaignEffectiveness(query),
		queryFn: () => fetchCampaignEffectivenessReport(query),
	});

export const agingQueueQueryOptions = (query?: FetchAgingQueueQuery) =>
	queryOptions({
		queryKey: queryKeys.agingQueue(query),
		queryFn: () => fetchAgingQueueReport(query),
	});
