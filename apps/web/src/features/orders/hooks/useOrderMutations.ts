import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
	cancelOrder,
	createOrderRefund,
	type SetOrderServicePricePayload,
	setOrderServicePrice,
	type UpdateOrderPaymentPayload,
	type UpdateOrderServiceStatusPayload,
	updateOrderCourier,
	updateOrderPayment,
	updateOrderServiceStatus,
} from "@/features/orders/api";
import { onOrderMoved, onRedemptionSpent } from "@/lib/cache-events";

export const useRefreshOrder = () => {
	const queryClient = useQueryClient();

	return useCallback(async () => {
		await onOrderMoved(queryClient);
	}, [queryClient]);
};

export const useUpdateServiceStatusMutation = (orderId: number) => {
	const refreshOrder = useRefreshOrder();

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

// ADR-0018: any staff may set or correct a line's price — the oversight is
// the server-side price log (who keyed what, from what), not a role gate.
export const useSetServicePriceMutation = (orderId: number) => {
	const refreshOrder = useRefreshOrder();

	return useMutation({
		mutationFn: ({
			serviceId,
			payload,
		}: {
			serviceId: number;
			payload: SetOrderServicePricePayload;
		}) => setOrderServicePrice(orderId, serviceId, payload),
		onSuccess: async () => {
			await refreshOrder();
		},
	});
};

export const useOrderPaymentMutation = (orderId: number) => {
	const queryClient = useQueryClient();
	const refreshOrder = useRefreshOrder();

	return useMutation({
		mutationFn: (payload: UpdateOrderPaymentPayload) =>
			updateOrderPayment(orderId, payload),
		// Settling at pickup is where the campaigns and voucher slips finally get
		// spent, so a capped promo that just hit its limit stops offering itself
		// at the next checkout.
		onSuccess: async () => {
			await Promise.all([refreshOrder(), onRedemptionSpent(queryClient)]);
		},
	});
};

export const useUpdateOrderCourierMutation = (orderId: number) => {
	const refreshOrder = useRefreshOrder();

	return useMutation({
		mutationFn: (collectedBy: number | null) =>
			updateOrderCourier(orderId, { collected_by: collectedBy }),
		onSuccess: async () => {
			await refreshOrder();
		},
	});
};

export const useRefundOrderMutation = () => {
	const refreshOrder = useRefreshOrder();

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
	const refreshOrder = useRefreshOrder();

	return useMutation({
		mutationFn: (payload: Parameters<typeof cancelOrder>[1]) =>
			cancelOrder(orderId, payload),
		onSuccess: async () => {
			await refreshOrder();
		},
	});
};
