interface Metadata {
  total?: number;
  limit?: number;
  offset?: number;
}

interface SuccessResponse<T, M extends object = Metadata> {
  success: true;
  message?: string;
  data: T;
  meta?: M;
}

interface ErrorResponse {
  success: false;
  message: string;
  errors?: unknown;
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
