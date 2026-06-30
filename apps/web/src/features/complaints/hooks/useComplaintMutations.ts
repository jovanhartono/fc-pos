import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	addComplaintRework,
	type OpenComplaintPayload,
	openComplaint,
	queryKeys,
} from "@/lib/api";

export const useOpenComplaintMutation = (orderId: number) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: OpenComplaintPayload) => openComplaint(payload),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["complaints"] }),
				queryClient.invalidateQueries({
					queryKey: queryKeys.orderDetail(orderId),
				}),
				queryClient.invalidateQueries({ queryKey: ["orders"] }),
			]);
		},
	});
};

export const useAddReworkMutation = (complaintId: number, orderId: number) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => addComplaintRework(complaintId),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: queryKeys.complaintDetail(complaintId),
				}),
				queryClient.invalidateQueries({ queryKey: ["complaints"] }),
				// Adding a rework flips the order rollup back to processing.
				queryClient.invalidateQueries({
					queryKey: queryKeys.orderDetail(orderId),
				}),
				queryClient.invalidateQueries({ queryKey: ["orders"] }),
			]);
		},
	});
};
