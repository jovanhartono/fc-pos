import { z } from "zod";

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

export const pageSizeSearch = z.coerce
	.number()
	.pipe(z.literal(PAGE_SIZES))
	.optional()
	.catch(undefined);

// The default stays out of the URL, so links that don't care keep working.
export const pageSizeChange = (limit: PageSize) => ({
	page: 1,
	limit: limit === DEFAULT_PAGE_SIZE ? undefined : limit,
});
