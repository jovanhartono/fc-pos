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

// hono's error message is only the status line ("400 Bad Request"); the server's
// reason sits in detail.data. Without this the cashier reads the status, not why.
export const readServerErrorMessage = (
	error: unknown,
	fallback = "Couldn't save",
): string => {
	if (error instanceof DetailedError) {
		const detail = error.detail as { data?: { message?: string } } | undefined;
		if (detail?.data?.message) {
			return detail.data.message;
		}
	}
	// A dropped connection rejects fetch with "Failed to fetch" (Chrome) or
	// "Load failed" (Safari); the cashier needs to know to check the Wi-Fi.
	if (error instanceof TypeError || error instanceof DetailedError) {
		return `${fallback}. Check the connection.`;
	}
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return fallback;
};
