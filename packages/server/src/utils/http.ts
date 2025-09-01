type Metadata = {
  total?: number;
  page?: number;
  pageSize?: number;
  [key: string]: unknown;
};

type SuccessResponse<T> = {
  success: true;
  message?: string;
  data: T;
  meta?: Metadata;
};

type ErrorResponse = {
  success: false;
  message: string;
  errors?: unknown;
};

export function success<T>(data: T, message?: string): SuccessResponse<T> {
  return {
    data,
    message,
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
