import { parseResponse } from "hono/client";

export interface PaginationMeta {
	total: number;
	limit: number;
	offset: number;
}

export interface PaginatedData<T> {
	items: T[];
	meta: PaginationMeta;
}

export async function parseSuccessData<T>(
	request: Parameters<typeof parseResponse>[0],
): Promise<T> {
	const response = await parseResponse(request);
	return response.data;
}

type QueryValue = string | number | boolean | undefined;

// An enum field keeps its literal union or hono rejects the call.
type SearchParamsOf<T> = {
	[K in keyof T]?: [Extract<T[K], string>] extends [never]
		? string
		: Extract<T[K], string>;
};

// A cleared filter is an absent param, never an empty one: four of the list
// endpoints reject `search=` outright, and `store_id=` would 400 the rest.
export function toSearchParams<T extends Record<string, QueryValue>>(
	query: T,
): SearchParamsOf<T> {
	return Object.fromEntries(
		Object.entries(query)
			.filter(([, value]) => value !== undefined && value !== "")
			.map(([key, value]) => [key, String(value)]),
	) as SearchParamsOf<T>;
}

export function toPaginated<T>(response: {
	data: T[];
	meta: PaginationMeta;
}): PaginatedData<T> {
	return { items: response.data, meta: response.meta };
}

export type PhotoContentType = "image/jpeg" | "image/png" | "image/webp";

export async function uploadFileToPresignedUrl(
	uploadUrl: string,
	file: File,
	contentType: PhotoContentType,
	signal?: AbortSignal,
) {
	const response = await fetch(uploadUrl, {
		method: "PUT",
		headers: {
			"Content-Type": contentType,
		},
		body: file,
		signal,
	});

	if (!response.ok) {
		throw new Error("Failed to upload file");
	}
}
