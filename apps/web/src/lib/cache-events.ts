import type { QueryClient } from "@tanstack/react-query";
import { campaignsKeys } from "@/features/campaigns/api";
import { complaintsKeys } from "@/features/complaints/api";
import { counterKeys } from "@/features/counter/api";
import { ordersKeys } from "@/features/orders/api";
import { shiftsKeys } from "@/features/shifts/api";

// One call for every write that moves an Order or its Items: the move shows on
// the Order, /orders, /queue, their chips and any Complaint. A caller that forgot
// one would leave the counter or a worker reading a stale number.
export const onOrderMoved = (queryClient: QueryClient) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: complaintsKeys.all }),
		queryClient.invalidateQueries({ queryKey: counterKeys.all }),
		queryClient.invalidateQueries({ queryKey: ordersKeys.all }),
	]);

export const onRedemptionSpent = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({ queryKey: campaignsKeys.all });

// Clocking in or out changes the badge on the worker's attendance screen, the
// week's list under it, and the manager's Shifts table.
export const onShiftClocked = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({ queryKey: shiftsKeys.all });
