import { useQuery } from "@tanstack/react-query";

import { shiftsQueries } from "@/features/shifts/api";

export const useCurrentShift = () => useQuery(shiftsQueries.current());
