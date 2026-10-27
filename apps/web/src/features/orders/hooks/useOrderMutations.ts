import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
	type CreatePaymentChargePayload,
	cancelOrder,
	cancelPaymentCharge,
	createOrderRefund,
	createPaymentCharge,
	ordersKeys,
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

// ADR-0018: any staff may set or correct a price; the price log is the oversight.
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
		// Campaigns and Vouchers get spent here, so one that just hit its Usage
		// limit stops showing at the next checkout.
		onSuccess: async () => {
			await Promise.all([refreshOrder(), onRedemptionSpent(queryClient)]);
		},
	});
};

// The charge is seeded into its poll's cache, so the QR shows without a second
// round trip.
export const useCreatePaymentChargeMutation = (orderId: number) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: CreatePaymentChargePayload) =>
			createPaymentCharge(orderId, payload),
		onSuccess: (charge) => {
			queryClient.setQueryData(
				ordersKeys.paymentCharge(orderId, charge.id),
				charge,
			);
		},
	});
};

export const useCancelPaymentChargeMutation = (orderId: number) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (chargeId: number) => cancelPaymentCharge(orderId, chargeId),
		onSuccess: (charge) => {
			queryClient.setQueryData(
				ordersKeys.paymentCharge(orderId, charge.id),
				charge,
			);
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
