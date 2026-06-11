import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
	cancelOrder,
	createOrderRefund,
	queryKeys,
	type UpdateOrderServiceStatusPayload,
	updateOrderPayment,
	updateOrderServiceStatus,
} from "@/lib/api";

export const useRefreshOrder = (orderId: number) => {
	const queryClient = useQueryClient();

	return useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: queryKeys.orderDetail(orderId),
			}),
			queryClient.invalidateQueries({ queryKey: ["orders"] }),
		]);
	}, [orderId, queryClient]);
};

export const useUpdateServiceStatusMutation = (orderId: number) => {
	const refreshOrder = useRefreshOrder(orderId);

	return useMutation({
		mutationFn: ({
			serviceId,
			payload,
		}: {
			serviceId: number;
			payload: UpdateOrderServiceStatusPayload;
		}) => updateOrderServiceStatus(orderId, serviceId, payload),
		onSuccess: async () => {
			await refreshOrder();
		},
	});
};

export const useOrderPaymentMutation = (orderId: number) => {
	const refreshOrder = useRefreshOrder(orderId);

	return useMutation({
		mutationFn: (paymentMethodId: number) =>
			updateOrderPayment(orderId, { payment_method_id: paymentMethodId }),
		onSuccess: async () => {
			await refreshOrder();
		},
	});
};

export const useRefundOrderMutation = (orderId: number) => {
	const refreshOrder = useRefreshOrder(orderId);

	return useMutation({
		mutationFn: ({
			orderId: targetOrderId,
			payload,
		}: {
			orderId: number;
			payload: Parameters<typeof createOrderRefund>[1];
		}) => createOrderRefund(targetOrderId, payload),
		onSuccess: async () => {
			await refreshOrder();
		},
	});
};

export const useCancelOrderMutation = (orderId: number) => {
	const refreshOrder = useRefreshOrder(orderId);

	return useMutation({
		mutationFn: (payload: Parameters<typeof cancelOrder>[1]) =>
			cancelOrder(orderId, payload),
		onSuccess: async () => {
			await refreshOrder();
		},
	});
};
