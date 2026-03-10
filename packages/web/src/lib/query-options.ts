import { queryOptions } from "@tanstack/react-query";
import {
	type FetchCampaignsQuery,
	type FetchCustomersQuery,
	type FetchOrdersQuery,
	type FetchUsersQuery,
	fetchCampaigns,
	fetchCampaignsPage,
	fetchCategories,
	fetchCurrentUserDetail,
	fetchCustomers,
	fetchCustomersPage,
	fetchDashboardCounts,
	fetchMyOrderServices,
	fetchOrderDetail,
	fetchOrders,
	fetchOrdersPage,
	fetchPaymentMethods,
	fetchProducts,
	fetchServices,
	fetchStores,
	fetchUsers,
	fetchUsersPage,
	queryKeys,
} from "@/lib/api";

export const dashboardQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.dashboard,
		queryFn: fetchDashboardCounts,
	});

export const customersQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.customers(),
		queryFn: fetchCustomers,
	});

export const customersPageQueryOptions = (query?: FetchCustomersQuery) =>
	queryOptions({
		queryKey: queryKeys.customers(query),
		queryFn: () => fetchCustomersPage(query),
	});

export const usersQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.users(),
		queryFn: fetchUsers,
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
	});

export const categoriesQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.categories,
		queryFn: fetchCategories,
	});

export const servicesQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.services,
		queryFn: fetchServices,
	});

export const productsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.products,
		queryFn: fetchProducts,
	});

export const paymentMethodsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.paymentMethods,
		queryFn: fetchPaymentMethods,
	});

export const ordersQueryOptions = (query?: FetchOrdersQuery) =>
	queryOptions({
		queryKey: queryKeys.orders(query),
		queryFn: () => fetchOrders(query),
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

export const campaignsPageQueryOptions = (query?: FetchCampaignsQuery) =>
	queryOptions({
		queryKey: queryKeys.campaigns(query),
		queryFn: () => fetchCampaignsPage(query),
	});

export const myOrderServicesQueryOptions = (storeId?: number) =>
	queryOptions({
		queryKey: queryKeys.myOrderServices(storeId),
		queryFn: () => fetchMyOrderServices(storeId),
	});
