import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
	type ConfirmOrderServiceEstimatePayload,
	cancelOrder,
	confirmOrderServiceEstimate,
	createOrderRefund,
	queryKeys,
	type UpdateOrderServiceStatusPayload,
	updateOrderCourier,
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

// ADR-0018: any staff may confirm; the server logs who settled what.
export const useConfirmEstimateMutation = (orderId: number) => {
	const refreshOrder = useRefreshOrder(orderId);

	return useMutation({
		mutationFn: ({
			serviceId,
			payload,
		}: {
			serviceId: number;
			payload: ConfirmOrderServiceEstimatePayload;
		}) => confirmOrderServiceEstimate(orderId, serviceId, payload),
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

export const useUpdateOrderCourierMutation = (orderId: number) => {
	const refreshOrder = useRefreshOrder(orderId);

	return useMutation({
		mutationFn: (collectedBy: number | null) =>
			updateOrderCourier(orderId, { collected_by: collectedBy }),
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
