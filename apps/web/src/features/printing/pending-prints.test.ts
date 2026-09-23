import { describe, expect, test } from "bun:test";
import { trackPrint, waitForPrints } from "./pending-prints";

const after = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

const isSettledWithin = (ms: number, promise: Promise<unknown>) =>
	Promise.race([promise.then(() => true), after(ms).then(() => false)]);

describe("waitForPrints", () => {
	test("a reload waits until the receipt still printing has finished", async () => {
		trackPrint(after(60));

		expect(await isSettledWithin(20, waitForPrints())).toBe(false);
		expect(await isSettledWithin(100, waitForPrints())).toBe(true);
	});

	test("a receipt that failed to print does not hold the reload", async () => {
		const failed = Promise.reject(new Error("printer out of paper"));
		failed.catch(() => undefined);
		trackPrint(failed);

		expect(await isSettledWithin(20, waitForPrints())).toBe(true);
	});
});
