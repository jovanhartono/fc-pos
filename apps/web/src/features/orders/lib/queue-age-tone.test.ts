import { describe, expect, it } from "bun:test";
import { getQueueAgeTone } from "./queue-age-tone";

const HOUR_MS = 3_600_000;
const PROMISE = 72;

describe("getQueueAgeTone", () => {
	it("stays muted while more than 24h remain", () => {
		expect(getQueueAgeTone(0, PROMISE)).toBe("muted");
		expect(getQueueAgeTone(48 * HOUR_MS - 1, PROMISE)).toBe("muted");
	});

	it("turns amber exactly 24h before the promise", () => {
		expect(getQueueAgeTone(48 * HOUR_MS, PROMISE)).toBe("amber");
		expect(getQueueAgeTone(72 * HOUR_MS - 1, PROMISE)).toBe("amber");
	});

	it("turns red at the promise", () => {
		expect(getQueueAgeTone(72 * HOUR_MS, PROMISE)).toBe("red");
		expect(getQueueAgeTone(200 * HOUR_MS, PROMISE)).toBe("red");
	});

	it("moves both thresholds with the promise", () => {
		expect(getQueueAgeTone(24 * HOUR_MS, 48)).toBe("amber");
		expect(getQueueAgeTone(48 * HOUR_MS, 48)).toBe("red");
	});
});
