import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import {
	type FetchOrderServiceQueueQuery,
	type FetchOrdersQuery,
	ordersQueries,
} from "@/features/orders/api";
import { pluralize } from "@/shared/utils";

// Same query as the list's first page, so the count costs nothing when the
// picks match the list, and Apply finds the new page already loaded.
interface ShowOrdersLabelProps {
	query: FetchOrdersQuery;
}

export const ShowOrdersLabel = ({ query }: ShowOrdersLabelProps) => {
	const { data, isPlaceholderData } = useQuery({
		...ordersQueries.list(query),
		placeholderData: keepPreviousData,
	});
	// The previous picks' count would read as these picks' until the list loads.
	const total = isPlaceholderData ? undefined : data?.meta.total;
	return total === undefined
		? "Show Orders"
		: `Show ${pluralize(total, "Order")}`;
};

interface ShowQueueItemsLabelProps {
	query: FetchOrderServiceQueueQuery;
}

export const ShowQueueItemsLabel = ({ query }: ShowQueueItemsLabelProps) => {
	const { data, isPlaceholderData } = useInfiniteQuery({
		...ordersQueries.queue(query),
		placeholderData: keepPreviousData,
	});
	const total = isPlaceholderData ? undefined : data?.pages[0]?.meta.total;
	return total === undefined
		? "Show Items"
		: `Show ${pluralize(total, "Item")}`;
};
