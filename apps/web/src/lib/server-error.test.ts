import { describe, expect, test } from "bun:test";
import { DetailedError } from "hono/client";
import { readServerErrorMessage } from "./server-error";

describe("readServerErrorMessage", () => {
	test("a rejected request reads as the server's reason, not the status line", () => {
		const error = new DetailedError("400 Bad Request", {
			detail: {
				data: {
					success: false,
					message: "Insufficient stock for product Nike Cleaner",
				},
			},
		});

		expect(readServerErrorMessage(error)).toBe(
			"Insufficient stock for product Nike Cleaner",
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
