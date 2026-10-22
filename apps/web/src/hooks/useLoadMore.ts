import { useEffect, useRef } from "react";

interface LoadMoreQuery {
	fetchNextPage: () => Promise<unknown>;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
}

interface LoadMoreOptions {
	// The element that scrolls. A margin only counts against the observer's own
	// root, so left on the viewport the list runs out before the next page lands.
	getRoot: () => Element | null;
	rootMargin: string;
}

// Loads the next page of an infinite query when the returned sentinel scrolls
// into view. Put the sentinel after the last row.
export const useLoadMore = (
	query: LoadMoreQuery,
	{ getRoot, rootMargin }: LoadMoreOptions,
) => {
	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const latest = useRef({ getRoot, query });
	useEffect(() => {
		latest.current = { getRoot, query };
	});

	const { hasNextPage, isFetchingNextPage } = query;

	// Re-armed after every page: a page too short to push the sentinel out of
	// view would otherwise never report it again, and the list would stop there.
	useEffect(() => {
		const node = sentinelRef.current;
		if (!node || !hasNextPage || isFetchingNextPage) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const [entry] = entries;
				if (!entry?.isIntersecting) {
					return;
				}
				const current = latest.current.query;
				if (current.hasNextPage && !current.isFetchingNextPage) {
					void current.fetchNextPage();
				}
			},
			{ root: latest.current.getRoot(), rootMargin },
		);

		observer.observe(node);

		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, rootMargin]);

	return sentinelRef;
};
