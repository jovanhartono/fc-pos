import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";

// One list for every write that moves an Order or one of its Items, because the
// same move lands on four screens: the order itself, the /orders list and its
// pills, and the /queue strip and its chips. A counter recording a pickup and a
// worker finishing a shoe each leave the other screen's number wrong, so the
// site that forgets a key is the bug — there must only be one site.
export const invalidateOrderQueries = (
	queryClient: QueryClient,
	orderId?: number,
) =>
	Promise.all([
		orderId === undefined
			? undefined
			: queryClient.invalidateQueries({
					queryKey: queryKeys.orderDetail(orderId),
				}),
		queryClient.invalidateQueries({ queryKey: ["orders"] }),
		queryClient.invalidateQueries({ queryKey: ["order-counts"] }),
		queryClient.invalidateQueries({ queryKey: ["order-service-queue"] }),
		queryClient.invalidateQueries({
			queryKey: ["order-service-queue-counts"],
		}),
	]);
