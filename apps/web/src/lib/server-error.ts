import { notFound } from "@tanstack/react-router";
import { DetailedError } from "hono/client";

export const isNotFoundError = (error: unknown) =>
  error instanceof DetailedError && error.statusCode === 404;

// A detail page's loader: an old or mistyped link shows the route's "not found"
// page, not the crash screen.
export const ensureOrNotFound = async <T>(load: Promise<T>) => {
  try {
    return await load;
  } catch (error) {
    if (isNotFoundError(error)) {
      throw notFound();
    }
    throw error;
  }
};

const FETCH_FAILED = /^(Failed to fetch|Load failed|NetworkError)/;

// hono's error message is only the status line ("400 Bad Request"); the server's
// reason sits in detail.data. Without this the cashier reads the status, not why.
export const readServerErrorMessage = (
  error: unknown,
  fallback = "Couldn't save"
): string => {
  // Without the server's reason, a bare "502 Bad Gateway" tells the cashier nothing.
  if (error instanceof DetailedError) {
    const detail = error.detail as { data?: { message?: string } } | undefined;
    return detail?.data?.message || fallback;
  }
  // The shop's Wi-Fi dropped: Chrome, Safari and Firefox each word it their
  // own way, and the cashier needs to know to check the connection.
  if (error instanceof TypeError && FETCH_FAILED.test(error.message)) {
    return `${fallback}. Check the connection.`;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return fallback;
};
