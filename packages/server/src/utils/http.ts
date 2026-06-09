interface Metadata {
  limit?: number;
  offset?: number;
  total?: number;
}

interface SuccessResponse<T, M extends object = Metadata> {
  data: T;
  message?: string;
  meta?: M;
  success: true;
}

interface ErrorResponse {
  errors?: unknown;
  message: string;
  success: false;
}

export function success<T, M extends object = Metadata>(
  data: T,
  message?: string,
  meta?: M
): SuccessResponse<T, M> {
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
