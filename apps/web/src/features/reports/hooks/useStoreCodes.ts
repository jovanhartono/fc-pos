import { useQuery } from "@tanstack/react-query";
import { storesQueries } from "@/features/stores/api";

export const useStoreCodes = () => {
	const { data: stores = [] } = useQuery(storesQueries.list());
	return new Map(stores.map((store) => [store.id, store.code]));
};
