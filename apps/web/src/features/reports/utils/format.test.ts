import { describe, expect, it } from "bun:test";
import { compactMoney } from "@/features/reports/utils/format";

describe("compact money", () => {
	it("moves up to jt when the thousands round to 1.000", () => {
		expect(compactMoney(999_400)).toBe("Rp 999 rb");
		expect(compactMoney(999_500)).toBe("Rp 1 jt");
		expect(compactMoney(999_800)).toBe("Rp 1 jt");
		expect(compactMoney(-999_800)).toBe("-Rp 1 jt");
	});

	it("keeps rb whole and jt to one decimal", () => {
		expect(compactMoney(12_345)).toBe("Rp 12 rb");
		expect(compactMoney(243_710_000)).toBe("Rp 243,7 jt");
		expect(compactMoney(950)).toBe("Rp 950");
	});
});
