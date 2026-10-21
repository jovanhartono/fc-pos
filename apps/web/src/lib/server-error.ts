import { DetailedError } from "hono/client";

export const isNotFoundError = (error: unknown) =>
	error instanceof DetailedError && error.statusCode === 404;

// hono's error message is only the status line ("400 Bad Request"); the server's
// reason sits in detail.data. Without this the cashier reads the status, not why.
export const readServerErrorMessage = (
	error: unknown,
	fallback = "Something went wrong",
): string => {
	if (error instanceof DetailedError) {
		const detail = error.detail as { data?: { message?: string } } | undefined;
		if (detail?.data?.message) {
			return detail.data.message;
		}
	}
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return fallback;
};
