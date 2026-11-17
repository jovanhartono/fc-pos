import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

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
  const { data } = useQuery(ordersQueries.list(query));
  const total = data?.meta.total;
  return total === undefined
    ? "Show Orders"
    : `Show ${pluralize(total, "Order")}`;
};

interface ShowQueueItemsLabelProps {
  query: FetchOrderServiceQueueQuery;
}

export const ShowQueueItemsLabel = ({ query }: ShowQueueItemsLabelProps) => {
  const { data } = useInfiniteQuery(ordersQueries.queue(query));
  const total = data?.pages[0]?.meta.total;
  return total === undefined
    ? "Show Items"
    : `Show ${pluralize(total, "Item")}`;
};
