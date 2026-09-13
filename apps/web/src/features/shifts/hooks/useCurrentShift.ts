import { useQuery } from "@tanstack/react-query";
import { shiftsQueries } from "@/features/shifts/api";

export function useCurrentShift() {
	return useQuery(shiftsQueries.current());
}
