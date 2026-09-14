import type { QueryClient } from "@tanstack/react-query";
import { campaignsKeys } from "@/features/campaigns/api";
import { complaintsKeys } from "@/features/complaints/api";
import { ordersKeys } from "@/features/orders/api";

// One call for every write that moves an Order or one of its Items, because the
// same move lands on four screens: the order itself, the /orders list and its
// pills, and the /queue strip and its chips. A counter recording a pickup and a
// worker finishing a shoe each leave the other screen's number wrong, so the
// site that forgets a screen is the bug — there must only be one site.
export const onOrderMoved = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({ queryKey: ordersKeys.all });

export const onRedemptionSpent = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({ queryKey: campaignsKeys.all });

export const onLineAdded = (queryClient: QueryClient) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: complaintsKeys.all }),
		queryClient.invalidateQueries({ queryKey: ordersKeys.all }),
	]);
