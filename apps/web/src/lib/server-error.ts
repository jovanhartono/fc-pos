import { DetailedError } from "hono/client";

// hono's parseResponse throws a DetailedError whose own message is just the
// status line ("400 Bad Request"); the server's reason rides in detail.data as
// { success: false, message }. Without this unwrap the user reads the status.
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
