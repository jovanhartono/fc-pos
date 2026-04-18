import { queryOptions } from "@tanstack/react-query";
import {
	type FetchCampaignsQuery,
	type FetchCustomersQuery,
	type FetchDailyReportQuery,
	type FetchOrdersQuery,
	type FetchShiftsQuery,
	type FetchUsersQuery,
	fetchCampaigns,
	fetchCategories,
	fetchCurrentShift,
	fetchCurrentUserDetail,
	fetchCustomersPage,
	fetchDailyReport,
	fetchDashboardCounts,
	fetchMyOrderServices,
	fetchOrderDetail,
	fetchOrdersPage,
	fetchPaymentMethods,
	fetchProducts,
	fetchServices,
	fetchShifts,
	fetchStores,
	fetchUsersPage,
	queryKeys,
} from "@/lib/api";

const REFERENCE_DATA_STALE_TIME = 5 * 60 * 1000;

export const dashboardQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.dashboard,
		queryFn: fetchDashboardCounts,
	});

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

export const currentUserDetailQueryOptions = (userId: number) =>
	queryOptions({
		queryKey: queryKeys.userDetail(userId),
		queryFn: fetchCurrentUserDetail,
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

export const myOrderServicesQueryOptions = (storeId?: number) =>
	queryOptions({
		queryKey: queryKeys.myOrderServices(storeId),
		queryFn: () => fetchMyOrderServices(storeId),
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

export const dailyReportQueryOptions = (query: FetchDailyReportQuery) =>
	queryOptions({
		queryKey: queryKeys.dailyReport(query),
		queryFn: () => fetchDailyReport(query),
	});
