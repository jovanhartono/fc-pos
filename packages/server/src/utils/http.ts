import type { PaginationMeta } from "@/utils/pagination";

interface SuccessResponse<T> {
  data: T;
  message?: string;
  success: true;
}

interface ErrorResponse {
  errors?: unknown;
  message: string;
  success: false;
}

// Two shapes, not one with an optional `meta`. A list endpoint always sends the
// page it served, so declaring `meta?` made every client write a fallback for a
// response the server cannot produce.
export function success<T>(data: T, message?: string): SuccessResponse<T>;
export function success<T>(
  data: T,
  message: string | undefined,
  meta: PaginationMeta
): SuccessResponse<T> & { meta: PaginationMeta };
export function success<T>(
  data: T,
  message?: string,
  meta?: PaginationMeta
): SuccessResponse<T> & { meta?: PaginationMeta } {
  return {
    data,
    message,
    meta,
    success: true,
  };
}

export function failure(message: string, errors?: unknown): ErrorResponse {
  return {
    errors,
    message,
    success: false,
  };
}
