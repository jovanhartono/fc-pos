import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	addComplaintRework,
	type OpenComplaintPayload,
	openComplaint,
} from "@/lib/api";
import { onLineAdded } from "@/lib/cache-events";

export const useOpenComplaintMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: OpenComplaintPayload) => openComplaint(payload),
		onSuccess: () => onLineAdded(queryClient),
	});
};

export const useAddReworkMutation = (complaintId: number) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => addComplaintRework(complaintId),
		onSuccess: () => onLineAdded(queryClient),
	});
};
