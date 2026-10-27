import { describe, expect, test } from "bun:test";
import { DetailedError } from "hono/client";
import { isNotFoundError, readServerErrorMessage } from "./server-error";

describe("isNotFoundError", () => {
	test("a link to an Order that doesn't exist is not found, not broken", () => {
		expect(
			isNotFoundError(new DetailedError("404 Not Found", { statusCode: 404 })),
		).toBe(true);
	});

	test("another Store's Order or a server fault keeps the error screen", () => {
		expect(
			isNotFoundError(new DetailedError("403 Forbidden", { statusCode: 403 })),
		).toBe(false);
		expect(isNotFoundError(new Error("Failed to fetch"))).toBe(false);
	});
});

describe("readServerErrorMessage", () => {
	test("a rejected request reads as the server's reason, not the status line", () => {
		const error = new DetailedError("400 Bad Request", {
			detail: {
				data: {
					success: false,
					message: "Not enough stock for Nike Cleaner",
				},
			},
		});

		expect(readServerErrorMessage(error)).toBe(
			"Not enough stock for Nike Cleaner",
		);
	});

	test("a dropped connection still says something", () => {
		expect(readServerErrorMessage(new Error("Failed to fetch"))).toBe(
			"Failed to fetch",
		);
	});

	test("a non-Error rejection falls back to the caller's wording", () => {
		expect(readServerErrorMessage(undefined, "Failed to record pickup")).toBe(
			"Failed to record pickup",
		);
	});
});
