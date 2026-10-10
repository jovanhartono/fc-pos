import { describe, expect, test } from "bun:test";
import { formatMoneyParts } from "@/shared/money";

describe("formatMoneyParts", () => {
	test("splits the Rp from the amount", () => {
		expect(formatMoneyParts("60000.00")).toEqual({
			currency: "Rp",
			amount: "60.000",
		});
	});

	test("keeps the minus with the amount", () => {
		expect(formatMoneyParts(-15_000)).toEqual({
			currency: "Rp",
			amount: "-15.000",
		});
	});
});
