import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";

// Clocking in or out changes both the badge on this screen and the week's
// list under it.
export const invalidateShiftQueries = (queryClient: QueryClient) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.shiftCurrent }),
		queryClient.invalidateQueries({ queryKey: ["shifts"] }),
	]);
