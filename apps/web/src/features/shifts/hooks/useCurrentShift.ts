import { useQuery } from "@tanstack/react-query";
import { currentShiftQueryOptions } from "@/lib/query-options";

export function useCurrentShift() {
	return useQuery(currentShiftQueryOptions());
}
