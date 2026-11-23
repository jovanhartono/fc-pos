export interface PaginationOptions {
  defaultPageSize?: number;
  maxPageSize?: number;
}

export interface PaginationInput {
  limit?: number;
  offset?: number;
}

export interface NormalizedPagination {
  limit: number;
  offset: number;
}

export interface PaginationMeta extends NormalizedPagination {
  total: number;
}

const clampInt = (
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
) => {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
};

export const normalizePagination = (
  input: PaginationInput | undefined,
  options: PaginationOptions = {}
): NormalizedPagination => {
  const defaultPageSize = options.defaultPageSize ?? 25;
  const maxPageSize = options.maxPageSize ?? 100;

  const limit = clampInt(input?.limit, 1, maxPageSize, defaultPageSize);
  const offset = clampInt(input?.offset, 0, Number.MAX_SAFE_INTEGER, 0);

  return {
    limit,
    offset,
  };
};

export const buildPaginationMeta = (
  total: number,
  pagination: NormalizedPagination
): PaginationMeta => ({
  limit: pagination.limit,
  offset: pagination.offset,
  total,
});
